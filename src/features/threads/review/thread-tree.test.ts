import test from "node:test"
import assert from "node:assert/strict"
import { buildThreadTree, flattenTree } from "./thread-tree.js"
import type { HistoryMessage } from "../../replies/reply-history.js"
import type { ReplyBatch, ReplyThread } from "../data/thread-types.js"

const thread = (id: string, label: string | undefined, batchID: string, parentThreadID?: string, status: ReplyThread["status"] = "sent"): ReplyThread => ({
  id, sessionID: "s", ...(label ? { label } : {}), ...(parentThreadID ? { parentThreadID } : {}), batchID,
  quote: { raw: `quote ${id}`, normalized: "" }, comment: `comment ${id}`, anchor: { confidence: "unmatched" }, status, createdAt: "", updatedAt: "",
})
const batch = (id: string, prompt: string, threadIDs: string[]): ReplyBatch => ({
  id, sessionID: "s", threadIDs, promptMessageID: prompt, promptHash: "h", status: "sent", createdAt: "", updatedAt: "",
})
const user = (id: string): HistoryMessage => ({ id, type: "user" })
const asst = (id: string, text: string): HistoryMessage => ({ id, type: "assistant", finish: "stop", content: [{ type: "text", text }] })

// Batch 1 comments 1 and 2; batch 2 follows up on 1 (1a); batch 3 follows up on 1a (1a1).
const threads = [
  thread("t1", "1", "b1"), thread("t2", "2", "b1"),
  thread("t3", "1a", "b2", "t1"),
  thread("t4", "1a1", "b3", "t3"),
]
const batches = [batch("b1", "u1", ["t1", "t2"]), batch("b2", "u2", ["t3"]), batch("b3", "u3", ["t4"])]
const messages = [
  user("u1"), asst("a1", "## 1\nanswer one\n## 2\nanswer two"),
  user("u2"), asst("a2", "just a plain answer"),
  user("u3"), asst("a3", "## 1a1\ndeep answer"),
]

test("follow-ups nest under the comment they followed up on, to any depth", () => {
  const tree = buildThreadTree(threads, batches, messages, false)
  assert.deepEqual(tree.map((node) => node.thread.label), ["1", "2"])
  assert.deepEqual(tree[0].children.map((node) => node.thread.label), ["1a"])
  assert.deepEqual(tree[0].children[0].children.map((node) => node.thread.label), ["1a1"])
  assert.deepEqual(flattenTree(tree).map((row) => `${"  ".repeat(row.depth)}${row.node.thread.label}`), ["1", "  1a", "    1a1", "2"])
})

test("each comment shows its own section; a one-comment batch without headings shows the whole answer", () => {
  const rows = flattenTree(buildThreadTree(threads, batches, messages, false))
  const reply = (label: string) => rows.find((row) => row.node.thread.label === label)!.node.reply
  assert.deepEqual(reply("1"), { kind: "section", text: "answer one" })
  assert.deepEqual(reply("2"), { kind: "section", text: "answer two" })
  assert.deepEqual(reply("1a"), { kind: "whole", text: "just a plain answer", comments: 1 })
  assert.deepEqual(reply("1a1"), { kind: "section", text: "deep answer" })
})

test("without headings the whole answer is shown once; the sibling points to it", () => {
  const rows = flattenTree(buildThreadTree(
    [thread("a", "1", "b"), thread("b2", "2", "b")], [batch("b", "u", ["a", "b2"])], [user("u"), asst("m", "one combined answer")], false,
  ))
  assert.deepEqual(rows[0].node.reply, { kind: "whole", text: "one combined answer", comments: 2 })
  assert.deepEqual(rows[1].node.reply, { kind: "shared" })
})

test("a comment the model skipped is 'unanswered' when it answered the others", () => {
  const rows = flattenTree(buildThreadTree(
    [thread("a", "1", "b"), thread("b2", "2", "b")], [batch("b", "u", ["a", "b2"])], [user("u"), asst("m", "## 1\nonly this")], false,
  ))
  assert.equal(rows[0].node.reply.kind, "section")
  assert.equal(rows[1].node.reply.kind, "unanswered")
})

test("reply states: running, missing history, and legacy threads without a label (sent before labels existed)", () => {
  const one = [thread("a", "1", "b")]
  const b = [batch("b", "u", ["a"])]
  assert.equal(buildThreadTree(one, b, [user("u")], true)[0].reply.kind, "running")
  assert.equal(buildThreadTree(one, b, [], false)[0].reply.kind, "missing")
  assert.equal(buildThreadTree([thread("a", undefined, "b")], b, [user("u"), asst("m", "x")], false)[0].reply.kind, "legacy")
})

test("pending threads are not part of the tree; an unknown parent becomes a root", () => {
  const tree = buildThreadTree(
    [thread("p", "3", "", undefined, "pending"), thread("o", "4", "b", "ghost")], [batch("b", "u", ["o"])], [user("u"), asst("m", "x")], false,
  )
  assert.deepEqual(tree.map((node) => node.thread.id), ["o"])
})

test("circular parent links terminate and keep every thread", () => {
  // c names p as parent, p names c: whichever is seen first becomes the root.
  const rows = flattenTree(buildThreadTree([thread("c", "1a", "b", "p"), thread("p", "1", "b", "c")], [batch("b", "u", ["c", "p"])], [], false))
  assert.deepEqual(rows.map((row) => row.node.thread.id), ["c", "p"])
})

test("deep chains are capped in depth so the sidebar stays readable", () => {
  let parent: string | undefined
  const chain = Array.from({ length: 8 }, (_, i) => { const t = thread(`t${i}`, `${i + 1}`, "b", parent); parent = t.id; return t })
  const rows = flattenTree(buildThreadTree(chain, [batch("b", "u", chain.map((t) => t.id))], [user("u")], false), 4)
  assert.equal(rows.length, 8)
  assert.equal(Math.max(...rows.map((row) => row.depth)), 4)
})

test("conversations are newest first; inside one, follow-ups read oldest to newest", () => {
  // 1 (old, never followed up), 2 (older, but followed up most recently by 2a then 2b), 3 (newest top-level)
  const all = [
    thread("t1", "1", "b1"),
    thread("t2", "2", "b1"),
    thread("t3", "3", "b2"),
    thread("t2a", "2a", "b3", "t2"),
    thread("t2b", "2b", "b4", "t2"),
  ]
  const bs = [batch("b1", "u1", ["t1", "t2"]), batch("b2", "u2", ["t3"]), batch("b3", "u3", ["t2a"]), batch("b4", "u4", ["t2b"])]
  const tree = buildThreadTree(all, bs, [], false)
  assert.deepEqual(tree.map((node) => node.thread.label), ["2", "3", "1"], "2 was followed up last, so its conversation is first")
  assert.deepEqual(tree[0].children.map((node) => node.thread.label), ["2a", "2b"], "follow-ups descend, most recent at the bottom")
  assert.deepEqual(flattenTree(tree).map((row) => row.node.thread.label), ["2", "2a", "2b", "3", "1"], "a parent always precedes its follow-ups")
})

test("comments sent together keep their label order inside a newest-first list", () => {
  const all = [thread("a", "1", "b1"), thread("b", "2", "b1"), thread("c", "3", "b2"), thread("d", "4", "b2")]
  const bs = [batch("b1", "u1", ["a", "b"]), batch("b2", "u2", ["c", "d"])]
  const tree = buildThreadTree(all, bs, [], false)
  assert.deepEqual(tree.map((node) => node.thread.label), ["3", "4", "1", "2"], "newest send first; within a send, 3 before 4")
})
