import test from "node:test"
import assert from "node:assert/strict"
import { deriveBatchReply, parseSections, type HistoryMessage } from "./reply-history.js"
import { resolveParent, squash } from "./parent-resolution.js"
import type { ReplyBatch, ReplyThread } from "../threads/data/thread-types.js"

const thread = (id: string, label: string): ReplyThread => ({
  id, sessionID: "s", label, quote: { raw: "q", normalized: "q" }, comment: "c",
  anchor: { confidence: "unmatched" }, status: "sent", createdAt: "", updatedAt: "",
})
const batch = (id: string, promptMessageID: string, threadIDs: string[], status: ReplyBatch["status"] = "sent"): ReplyBatch => ({
  id, sessionID: "s", threadIDs, promptMessageID, promptHash: "h", status, createdAt: "", updatedAt: "",
})
const user = (id: string): HistoryMessage => ({ id, type: "user" })
const asst = (id: string, text: string, finish = "stop"): HistoryMessage => ({ id, type: "assistant", finish, content: [{ type: "text", text }] })
const labels = (...l: string[]) => new Set(l)
const textOf = (m: Map<string, { text: string }>, label: string) => m.get(label)?.text

test("splits a real-shaped answer into one section per label, ending at ## Revised", () => {
  const text = [
    "## 1", "", "Correct. Restarting the TUI reloads plugins.", "",
    "## 2", "", "Mostly true:", "", "- Ctrl+C exits when idle", "- It may interrupt a run first", "",
    "## Revised", "", "Exit and start again.",
  ].join("\n")
  const sections = parseSections([{ messageID: "m1", text }], labels("1", "2"))
  assert.equal(textOf(sections, "1"), "Correct. Restarting the TUI reloads plugins.")
  assert.match(textOf(sections, "2")!, /^Mostly true:[\s\S]*interrupt a run first$/)
  assert.doesNotMatch(textOf(sections, "2")!, /Revised|start again/)
})

test("accepts the heading styles a model actually writes", () => {
  for (const marker of ["## 1", "## 1.", "### Thread 1", "## Comment 1:", "## Re 1", "## 1. Restart", "## 1 — Restart", "**1.**", "**Thread 1**", "**Thread 1:**", "## **1**", "## #1"]) {
    const sections = parseSections([{ messageID: "m", text: `${marker}\nbody` }], labels("1"))
    assert.equal(textOf(sections, "1"), "body", `marker ${JSON.stringify(marker)}`)
  }
})

test("rejects lookalikes: prose headings, list items, numbers the batch lacks", () => {
  for (const line of ["## 2 options", "## 10 ways to fix", "1. item", "- 1", "## Revised", "Thread 1", "## 1st thing", "## 7"]) {
    assert.equal(parseSections([{ messageID: "m", text: `${line}\nbody` }], labels("1")).size, 0, `line ${JSON.stringify(line)}`)
  }
})

test("labels are case-insensitive and follow-up labels work", () => {
  const text = "## 1A\nanswer to 1a\n## 1a1\nanswer to 1a1\n## 2\nanswer 2"
  const sections = parseSections([{ messageID: "m", text }], labels("1a", "1a1", "2"))
  assert.equal(textOf(sections, "1a"), "answer to 1a")
  assert.equal(textOf(sections, "1a1"), "answer to 1a1")
  assert.equal(textOf(sections, "2"), "answer 2")
})

test("only the first heading for a label counts; a repeat in the revised text is body", () => {
  const text = "## 1\nfirst\n## Revised\nrecap\n## 1\nagain"
  assert.equal(textOf(parseSections([{ messageID: "m", text }], labels("1")), "1"), "first")
})

test("a sub-heading inside a section stays in it; a rule or same-level heading ends it", () => {
  const sub = parseSections([{ messageID: "m", text: "## 1\nintro\n### Detail\nmore\n## 2\nb" }], labels("1", "2"))
  assert.match(textOf(sub, "1")!, /intro[\s\S]*### Detail[\s\S]*more/)
  const rule = parseSections([{ messageID: "m", text: "## 1\nbody\n\n---\n\nclosing remarks" }], labels("1"))
  assert.equal(textOf(rule, "1"), "body")
})

test("headings inside code fences are code, not structure", () => {
  const text = "## 1\nrun:\n```md\n## 2\nnot a section\n```\ndone"
  const sections = parseSections([{ messageID: "m", text }], labels("1", "2"))
  assert.equal(sections.has("2"), false)
  assert.match(textOf(sections, "1")!, /not a section[\s\S]*done/)
})

test("a section can span assistant messages and records which ones", () => {
  const sections = parseSections(
    [{ messageID: "m1", text: "## 1\npart one" }, { messageID: "m2", text: "part two\n## 2\nx" }],
    labels("1", "2"),
  )
  assert.deepEqual(sections.get("1")?.messageIDs, ["m1", "m2"])
  assert.equal(textOf(sections, "1"), "part one\n\npart two")
})

// ── deriveBatchReply ────────────────────────────────────────────────────────
const threads = [thread("t1", "1"), thread("t2", "2")]
const b1 = batch("b1", "u1", ["t1", "t2"])

test("the reply is the assistant messages after the prompt, up to the next user message", () => {
  const history = [
    user("u0"), asst("a0", "old answer"),
    user("u1"),
    asst("a1", "Looking.", "tool-calls"), asst("a2", "## 1\nfirst\n## 2\nsecond"),
    user("u2"), asst("a3", "later"),
  ]
  const reply = deriveBatchReply(b1, threads, history, false)
  assert.equal(reply.state, "done")
  assert.deepEqual(reply.messageIDs, ["a1", "a2"])
  assert.equal(reply.sections.t1.text, "first")
  assert.equal(reply.sections.t2.text, "second")
  assert.equal(reply.sectioned, true)
})

test("tool-step narration without headings does not break sectioning", () => {
  const history = [user("u1"), asst("a1", "I'll check.", "tool-calls"), asst("a2", "Now reading.", "tool-calls"), asst("a3", "## 1\nok")]
  const reply = deriveBatchReply(batch("b", "u1", ["t1"]), threads, history, false)
  assert.equal(reply.sections.t1.text, "ok")
  assert.equal(reply.finalText, "## 1\nok")
})

test("no headings: whole-answer fallback text, not sectioned", () => {
  const reply = deriveBatchReply(b1, threads, [user("u1"), asst("a1", "One combined answer.")], false)
  assert.equal(reply.state, "done")
  assert.equal(reply.sectioned, false)
  assert.equal(reply.finalText, "One combined answer.")
})

test("states: missing prompt, running turn, and an empty turn", () => {
  assert.equal(deriveBatchReply(b1, threads, [user("other")], false).state, "missing")
  assert.equal(deriveBatchReply(b1, threads, [user("u1")], true).state, "running")
  assert.equal(deriveBatchReply(b1, threads, [user("u1"), asst("a1", "partial", "tool-calls")], true).state, "running")
  assert.equal(deriveBatchReply(b1, threads, [user("u1")], false).state, "empty")
  // A closed turn is never "running", even while the session is busy with a later turn.
  assert.equal(deriveBatchReply(b1, threads, [user("u1"), asst("a1", "x"), user("u2")], true).state, "done")
})

test("a reply uses the admitted message ID when it differs from the planned one", () => {
  const b = { ...batch("b", "planned", ["t1"]), admittedMessageID: "actual" }
  assert.equal(deriveBatchReply(b, threads, [user("actual"), asst("a1", "## 1\nhi")], false).sections.t1.text, "hi")
})

test("a labeled send's synthetic label before the prompt does not end the turn", () => {
  const history: HistoryMessage[] = [{ id: "label", type: "synthetic" }, user("u1"), asst("a1", "## 1\nanswer")]
  assert.equal(deriveBatchReply(batch("b", "u1", ["t1"]), threads, history, false).sections.t1.text, "answer")
})

test("threads without a label (saved before labels existed) get no sections", () => {
  const legacy = [{ ...thread("t1", "1"), label: undefined } as ReplyThread]
  const reply = deriveBatchReply(batch("b", "u1", ["t1"]), legacy, [user("u1"), asst("a1", "## 1\nhi")], false)
  assert.deepEqual(reply.sections, {})
})

// ── resolveParent ───────────────────────────────────────────────────────────
test("squash removes Markdown a terminal selection would not contain", () => {
  assert.equal(squash("- **Cause:** the `overlay`\n  [docs](http://x)"), "Cause: the overlay docs")
})

test("a quote inside one section links to that comment, even when formatted in the source", () => {
  const history = [
    user("u1"),
    asst("a1", "## 1\nUse **optimistic locking** when conflicts are rare.\n## 2\nUse `pessimistic` locking for hot rows."),
  ]
  const input = { batches: [b1], threads, messages: history }
  assert.deepEqual(resolveParent({ ...input, quote: "optimistic locking when conflicts are rare" }), { parentThreadID: "t1" })
  assert.deepEqual(resolveParent({ ...input, quote: "pessimistic locking for hot rows" }), { parentThreadID: "t2" })
})

test("a one-comment batch needs no headings: the whole reply answers it", () => {
  const history = [user("u1"), asst("a1", "It reloads at startup.")]
  assert.deepEqual(
    resolveParent({ quote: "reloads at startup", batches: [batch("b", "u1", ["t1"])], threads, messages: history }),
    { parentThreadID: "t1" },
  )
})

test("a multi-comment reply without headings is reported unpinned, never guessed", () => {
  const history = [user("u1"), asst("a1", "Both are fine as described.")]
  assert.deepEqual(resolveParent({ quote: "both are fine", batches: [b1], threads, messages: history }), {})
  assert.deepEqual(resolveParent({ quote: "Both are fine", batches: [b1], threads, messages: history }), { unpinned: true })
})

test("no parent when the quote is from an ordinary message, or appears in two replies", () => {
  const history = [
    user("u0"), asst("plain", "An unrelated answer."),
    user("u1"), asst("a1", "## 1\nshared sentence here"),
    user("u2"), asst("a2", "## 1\nshared sentence here"),
  ]
  const batches = [batch("b1", "u1", ["t1"]), batch("b2", "u2", ["t3"])]
  const all = [thread("t1", "1"), thread("t3", "2")]
  assert.deepEqual(resolveParent({ quote: "unrelated answer", batches, threads: all, messages: history }), {})
  assert.deepEqual(resolveParent({ quote: "shared sentence here", batches, threads: all, messages: history }), {})
  assert.deepEqual(resolveParent({ quote: "   ", batches, threads: all, messages: history }), {})
})

test("failed batches and batches missing from loaded history never become parents", () => {
  const history = [user("u1"), asst("a1", "## 1\nsome distinctive text")]
  assert.deepEqual(resolveParent({ quote: "distinctive text", batches: [batch("b", "u1", ["t1"], "failed")], threads, messages: history }), {})
  assert.deepEqual(resolveParent({ quote: "distinctive text", batches: [batch("b", "gone", ["t1"])], threads, messages: history }), {})
})
