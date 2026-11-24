"""Run key Reply Threads flows in one isolated TUI, using fixture history and no model calls."""

import argparse
import base64
import datetime
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import termios
import time
import urllib.request

try:
    import pyte
except ImportError:
    sys.exit("Install smoke-test dependencies: python3 -m pip install -r scripts/smoke-requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 160, 50
FIRST_EXCERPT = "First excerpt for smoke selection."
SECOND_EXCERPT = "Second excerpt for smoke selection."
OLDER_ANSWER = "Older tracked answer remains available."


class SmokeTerminal:
    """Own the PTY and wait for rendered conditions rather than fixed startup sleeps."""

    def __init__(self, executable, server_url, session_id, environment):
        self.screen = pyte.Screen(WIDTH, HEIGHT)
        self.stream = pyte.ByteStream(self.screen)
        self.output = bytearray()
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.execve(executable, [executable, "--server", server_url, "--session", session_id], environment)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", HEIGHT, WIDTH, 0, 0))

    def pump(self, timeout=0.02):
        if select.select([self.fd], [], [], timeout)[0]:
            data = os.read(self.fd, 65536)
            if not data:
                raise RuntimeError("The TUI exited before the smoke test finished")
            self.output.extend(data)
            if b"\x1b[6n" in data:
                os.write(self.fd, b"\x1b[1;1R")
            self.stream.feed(data)
            return True
        return False

    def wait(self, condition, description, timeout=12):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            # Conditions must hold after the terminal output goes quiet, not
            # halfway through a frame that is still moving the next click target.
            updated = self.pump()
            if condition() and not updated:
                return
        raise AssertionError(f"Timed out waiting for {description}")

    def find(self, text):
        for y, line in enumerate(self.screen.display):
            if text in line:
                return line.index(text), y
        return None

    def type(self, text):
        os.write(self.fd, text.encode() if isinstance(text, str) else text)

    def mouse(self, code, x, y, release=False):
        self.type(f"\x1b[<{code};{x + 1};{y + 1}{'m' if release else 'M'}")

    def click(self, x, y):
        self.mouse(0, x, y)
        self.pump(0.02)
        self.mouse(0, x, y, release=True)

    def click_text(self, text):
        self.wait(lambda: self.find(text), text)
        x, y = self.find(text)
        self.click(x + 2, y)

    def select_excerpt(self, text):
        self.wait(lambda: self.find(text), text)
        x, y = self.find(text)
        self.mouse(0, x, y)
        for offset in (3, 8, 14, 20):
            self.mouse(32, x + offset, y)
        self.mouse(0, x + 20, y, release=True)
        self.wait(lambda: self.find("Your reply"), "annotation input")
        self.wait_for_editor_focus()

    def wait_for_editor_focus(self):
        def cursor_is_in_editor():
            label = self.find("Your reply")
            if not label:
                return False
            x, y = label
            cursor = self.screen.cursor
            return not cursor.hidden and cursor.x >= x and y < cursor.y < y + 8
        self.wait(cursor_is_in_editor, "textarea focus")

    def close(self):
        try:
            os.killpg(self.pid, signal.SIGTERM)
            deadline = time.monotonic() + 1
            while time.monotonic() < deadline:
                if os.waitpid(self.pid, os.WNOHANG)[0]:
                    break
                time.sleep(0.01)
            else:
                os.killpg(self.pid, signal.SIGKILL)
                os.waitpid(self.pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass
        os.close(self.fd)


def seed_fixture(home, session_id):
    """Seed only the throwaway server's SQLite database and plugin store before attaching."""
    now = int(time.time() * 1000)
    date = datetime.datetime.now(datetime.timezone.utc).isoformat()
    records = [("user", {"text": "A fixture comment."}), ("assistant", {"content": [{"type": "text", "text": f"## 1\n{OLDER_ANSWER}"}]}), ("user", {"text": "A later turn."})]
    records += [("assistant", {"content": [{"type": "text", "text": f"Newer history {index}"}]}) for index in range(120)]
    records.append(("assistant", {"content": [{"type": "text", "text": f"{FIRST_EXCERPT}\n\n{SECOND_EXCERPT}"}]}))
    message_ids = []
    with sqlite3.connect(home / ".local/share/opencode/opencode.db", timeout=10) as database:
        start = database.execute("select coalesce(max(seq), 0) from session_message where session_id=?", (session_id,)).fetchone()[0]
        for index, (kind, data) in enumerate(records, 1):
            message_id = f"msg_{now:012x}{index:012x}"
            message_ids.append(message_id)
            data["time"] = {"created": now + index, "completed": now + index}
            if kind == "assistant":
                data.update(agent="build", model={"id": "smoke-fixture", "providerID": "opencode"}, finish="stop")
            database.execute("insert into session_message values(?,?,?,?,?,?,?)", (message_id, session_id, kind, start + index, now + index, now + index, json.dumps(data)))
    stored = {
        "schemaVersion": 1, "revision": 1, "sessions": {session_id: {
            "threads": [{"id": "rt_smoke_sent", "sessionID": session_id, "label": "1", "quote": {"raw": "Fixture quote", "normalized": "Fixture quote"}, "comment": "Earlier sent comment", "anchor": {"confidence": "unmatched"}, "status": "sent", "batchID": "batch_smoke", "createdAt": date, "updatedAt": date, "sentAt": date}],
            "batches": [{"id": "batch_smoke", "sessionID": session_id, "threadIDs": ["rt_smoke_sent"], "promptMessageID": message_ids[0], "promptHash": "smoke", "status": "sent", "createdAt": date, "updatedAt": date, "sentAt": date}],
        }},
    }
    path = home / ".local/state/opencode/beta/tui/plugin.reply-threads.repository.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(stored))
    return path, stored["sessions"][session_id]["batches"]


def run(keep_artifacts=False):
    started = time.monotonic()
    executable = shutil.which(os.environ.get("OPENCODE_BIN", "opencode2"))
    if not executable:
        raise RuntimeError("opencode2 is not on PATH; set OPENCODE_BIN to its executable")
    home = Path(tempfile.mkdtemp(prefix="reply-threads-smoke-", dir=os.environ.get("OPENCODE_SMOKE_DIR")))
    workspace = home / "workspace"
    workspace.mkdir()
    environment = dict(os.environ, HOME=str(home), TERM="xterm-256color", COLORTERM="truecolor", OPENCODE_LOG_LEVEL="DEBUG")
    for key, suffix in {"XDG_CONFIG_HOME": ".config", "XDG_DATA_HOME": ".local/share", "XDG_STATE_HOME": ".local/state", "XDG_CACHE_HOME": ".cache"}.items():
        environment[key] = str(home / suffix)
    for key in ("OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_SERVER_URL", "OPENCODE_SERVER_PASSWORD", "OPENCODE_SERVER_USERNAME"):
        environment.pop(key, None)
    config = home / ".config/opencode"
    config.mkdir(parents=True)
    (config / "cli.json").write_text(json.dumps({"plugins": [str(ROOT)]}))
    with socket.socket() as available_port:
        available_port.bind(("127.0.0.1", 0))
        port = available_port.getsockname()[1]
    server_url = f"http://127.0.0.1:{port}"
    log_path = home / "server.log"
    terminal = None
    server = None
    failed = False
    try:
        with log_path.open("w") as log:
            server = subprocess.Popen([executable, "serve", "--hostname", "127.0.0.1", "--port", str(port)], cwd=workspace, env=environment, stdout=log, stderr=log, start_new_session=True)
        deadline = time.monotonic() + 20
        password = None
        while time.monotonic() < deadline:
            password = next((line.split()[-1] for line in log_path.read_text().splitlines() if "server password" in line), None)
            if password:
                break
            if server.poll() is not None:
                raise RuntimeError("The isolated server exited during startup")
            time.sleep(0.02)
        if not password:
            raise RuntimeError("The isolated server did not report its connection password")
        auth = base64.b64encode(f"opencode:{password}".encode()).decode()
        request = urllib.request.Request(server_url + "/api/session", data=b"{}", headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            session_id = json.load(response)["data"]["id"]
        store_path, original_batches = seed_fixture(home, session_id)
        environment.update(OPENCODE_SERVER_PASSWORD=password, OPENCODE_SERVER_USERNAME="opencode")
        # The PTY child starts outside the checkout so parent project configuration cannot leak in.
        def attach_terminal():
            previous_directory = os.getcwd()
            os.chdir(workspace)
            try:
                return SmokeTerminal(executable, server_url, session_id, environment)
            finally:
                os.chdir(previous_directory)
        terminal = attach_terminal()

        def stored_session():
            try:
                return json.loads(store_path.read_text())["sessions"][session_id]
            except (OSError, ValueError):
                return {"threads": [], "batches": []}

        def pending():
            return [thread for thread in stored_session()["threads"] if thread["status"] == "pending"]

        terminal.wait(lambda: terminal.find("Ctrl+Y reply mode"), "plugin toolbar")
        terminal.type(b"\x19")
        terminal.wait(lambda: terminal.find("Ctrl+Y exits"), "Reply Mode")
        for index, excerpt in enumerate((FIRST_EXCERPT, SECOND_EXCERPT), 1):
            terminal.select_excerpt(excerpt)
            text = f"{'First' if index == 1 else 'Second'} smoke comment"
            terminal.type(text)
            terminal.wait(lambda: terminal.find(text), "typed comment")
            terminal.type(b"\r")
            terminal.wait(lambda: len(pending()) == index and not terminal.find("Your reply"), f"Enter save {index}")
        print("PASS repeated Enter saves", flush=True)

        for text in ("", "Discard unsaved input"):
            terminal.select_excerpt(FIRST_EXCERPT)
            if text:
                terminal.type(text)
                terminal.wait(lambda: terminal.find(text), "unsaved text")
            terminal.click_text("Cancel")
            terminal.wait(lambda: not terminal.find("Your reply"), "Cancel closing the editor")
            assert len(pending()) == 2, "Cancel changed saved comments"
        print("PASS empty and typed Cancel", flush=True)

        terminal.click_text("First smoke comment")
        terminal.type(b"e")
        terminal.wait(lambda: terminal.find("Your reply"), "prefilled edit input")
        terminal.wait_for_editor_focus()
        terminal.type(" (edited)")
        terminal.type(b"\r")
        terminal.wait(lambda: any(thread["comment"] == "First smoke comment (edited)" for thread in pending()) and not terminal.find("Your reply"), "saving an existing comment")
        print("PASS prefilled pending edit", flush=True)

        terminal.wait(lambda: terminal.find("Second smoke comment"), "second pending card")
        _, comment_row = terminal.find("Second smoke comment")
        button_row = next(y for y in range(comment_row, HEIGHT) if "Discard" in terminal.screen.display[y])
        terminal.click(terminal.screen.display[button_row].index("Discard") + 2, button_row)
        terminal.wait(lambda: terminal.find("Delete reply thread?"), "discard confirmation")
        terminal.type(b"\r")
        terminal.wait(lambda: len(pending()) == 1, "discarding only the selected card")
        terminal.wait(lambda: terminal.find(OLDER_ANSWER), "answer behind 120 newer messages")
        assert pending()[0]["comment"] == "First smoke comment (edited)"
        assert stored_session()["batches"] == original_batches, "Discard changed sent batches"
        assert any(thread["id"] == "rt_smoke_sent" for thread in stored_session()["threads"])
        assert not terminal.find("not in the loaded history"), "An intact answer became unavailable"
        print("PASS discard preserves sent records and older answers", flush=True)
        with sqlite3.connect(home / ".local/share/opencode/opencode.db", timeout=10) as database:
            prompts = database.execute("select count(*) from session_message where session_id=? and type='user'", (session_id,)).fetchone()[0]
            assert prompts == 2, "The smoke suite unexpectedly submitted a model prompt"

        terminal.close()
        terminal = None
        incompatible = json.loads(store_path.read_text())
        incompatible["schemaVersion"] = 99
        original_file = json.dumps(incompatible)
        store_path.write_text(original_file)
        terminal = attach_terminal()
        terminal.wait(lambda: terminal.find("Saved Reply Threads data"), "incompatible-data notification")
        assert not terminal.find("Ctrl+Y reply mode"), "Invalid data still mounted annotation actions"
        assert store_path.read_text() == original_file, "Unsupported saved data was overwritten"
        print("PASS invalid saved data is reported and preserved", flush=True)
        print(f"Reply Threads feature smoke passed in {time.monotonic() - started:.1f}s", flush=True)
    except BaseException:
        failed = True
        if terminal:
            (home / "screen.txt").write_text("\n".join(terminal.screen.display))
            (home / "terminal.log").write_bytes(terminal.output)
        print(f"Smoke artifacts: {home}", file=sys.stderr)
        raise
    finally:
        if terminal:
            terminal.close()
        if server:
            try:
                os.killpg(server.pid, signal.SIGTERM)
                server.wait(timeout=2)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait(timeout=2)
                except ProcessLookupError:
                    pass
        if not failed and not keep_artifacts:
            shutil.rmtree(home)
        elif not failed:
            print(f"Smoke artifacts: {home}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep-artifacts", action="store_true", help="Keep the isolated home and terminal logs after success")
    arguments = parser.parse_args()
    run(arguments.keep_artifacts)
