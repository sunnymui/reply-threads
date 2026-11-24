import test from "node:test"
import assert from "node:assert/strict"
import { batchInstruction, batchMetadata, composeBatch, parentLabelOf, promptHash } from "./compose-prompt.js"
import type { ReplyThread } from "../../threads/data/thread-types.js"

const thread = (id: string, quote: string, comment: string, label?: string): ReplyThread => ({
  id,
  ...(label ? { label } : {}),
  sessionID: "ses_1",
  quote: { raw: quote, normalized: quote },
  comment,
  anchor: { confidence: "unmatched" },
  status: "pending",
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
})

const threads = [thread("rt_1", "first\nsecond", "Clarify this.", "1"), thread("rt_2", "> existing marker", "Explain the edge case.", "2")]

test("composes every thread deterministically and quotes every selected line", () => {
  const first = composeBatch(threads)
  assert.equal(first, composeBatch(threads))
  assert.equal(
    first,
    [
      "Reply to each comment under a heading with its number (## 1). Then ## Revised, if needed.",
      "",
      "1.",
      "> first",
      "> second",
      "",
      "COMMENT: Clarify this.",
      "",
      "2.",
      "> > existing marker",
      "",
      "COMMENT: Explain the edge case.",
    ].join("\n"),
  )
})

test("prompts use the thread's session-unique label, and explain a follow-up with a real example", () => {
  const prompt = composeBatch([thread("rt_3", "q", "c", "1a"), thread("rt_4", "q2", "c2", "3")])
  assert.match(prompt, /^Reply to each comment under a heading with its label \(## 1a\); 1a follows up on 1\. Then ## Revised, if needed\.$/m)
  assert.match(prompt, /\n\n1a\.\n> q\n\nCOMMENT: c\n\n3\.\n> q2\n/)
  assert.equal(batchInstruction([thread("rt_5", "q", "c", "4")]), "Reply to each comment under a heading with its number (## 4). Then ## Revised, if needed.")
})

test("a label's parent label is everything before its last digit or letter run", () => {
  assert.equal(parentLabelOf("1"), undefined)
  assert.equal(parentLabelOf("1a"), "1")
  assert.equal(parentLabelOf("1a2"), "1a")
  assert.equal(parentLabelOf("12bc"), "12")
  assert.equal(parentLabelOf("3aa4b"), "3aa4")
})

test("keeps quote and comment unambiguous even when a comment looks like a quote", () => {
  const tricky = composeBatch([thread("rt_1", "quoted", "> not a quote\nsecond line")])
  assert.match(tricky, /^> quoted\n\nCOMMENT: > not a quote\nsecond line$/m)
})

test("template overhead stays small (guards against re-bloating the prompt)", () => {
  const body = (n: number) => composeBatch(Array.from({ length: n }, (_, i) => thread(`rt_${i}`, "q", "c")))
  // Fixed preamble + per-thread framing, excluding the 2 payload chars per thread.
  assert.ok(body(1).length - 2 <= 140, `fixed overhead grew: ${body(1).length}`)
  assert.ok(body(2).length - body(1).length - 2 <= 32, "per-thread overhead grew")
})

test("rejects an empty batch", () => assert.throws(() => composeBatch([]), /empty/))

test("produces a stable hash and reconciliation metadata", () => {
  const hash = promptHash(composeBatch(threads))
  assert.match(hash, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(batchMetadata("batch_1", hash), {
    replyThreadsBatchID: "batch_1",
    replyThreadsPromptHash: hash,
  })
})
