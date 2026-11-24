import type { Context } from "@opencode/plugin/tui/context"

/**
 * Dispatches the host’s session-pane focus command after annotation teardown so the host overlay
 * cannot consume the user’s next click.
 *
 * The host overlays the session pane while the right pane owns focus, consuming the first click
 * elsewhere. Dispatch pane.focus.left one tick after teardown to release it. If the command is
 * unavailable, the dispatch is a no-op or its synchronous error is ignored.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @returns Nothing; schedules the focus dispatch and tolerates an unavailable command.
 */
export function releasePanelFocus(context: Pick<Context, "keymap">): void {
  setTimeout(() => {
    try {
      context.keymap.dispatch("pane.focus.left")
    } catch {
      // not reachable in this host version
    }
  }, 0)
}
