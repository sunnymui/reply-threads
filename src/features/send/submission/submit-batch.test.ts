import test from "node:test"
import assert from "node:assert/strict"
import type { Context } from "@opencode/plugin/tui/context"
import { cancelBatchLabel, submitBatch } from "./submit-batch.js"
import { createBatch } from "../preparation/create-batch.js"
import { batchInstruction, batchLabel, composeBatch, composeBatchParts } from "../preparation/compose-prompt.js"
import { recoverSessionBatches } from "../recovery/recover-batches.js"
import { addThread, beginBatch, createThread } from "../../threads/data/thread-repository.js"
import { initialRepositoryState } from "../../threads/data/thread-types.js"

const now = "2026-10-05T00:00:00.000Z"
const thread = (id: string, quote: string, comment: string) =>
  createThread({
    id, sessionID: "ses_1", rawQuote: quote, comment, now,
    attribution: { confidence: "unmatched", normalized: quote, candidates: [] },
  })
const threads = [thread("rt_1", "first quote", "first comment"), thread("rt_2", "second\nquote", "second comment")]

function build() {
  return createBatch({
    id: "batch_1", promptMessageID: "msg_abb", labelMessageID: "msg_aaa", sessionID: "ses_1", threads, now,
  })
}

type Call = { op: string; input: Record<string, unknown> }
function fakeContext(options: { failSynthetic?: boolean; failPrompt?: boolean; failCancel?: boolean } = {}) {
  const calls: Call[] = []
  const context = {
    client: {
      session: {
        synthetic: async (input: Record<string, unknown>) => {
          calls.push({ op: "synthetic", input })
          if (options.failSynthetic) throw new Error("synthetic failed")
          return { id: input.id }
        },
        prompt: async (input: Record<string, unknown>) => {
          calls.push({ op: "prompt", input })
          if (options.failPrompt) throw new Error("400 invalid")
          return { id: input.id }
        },
        inbox: {
          cancel: async (input: Record<string, unknown>) => {
            calls.push({ op: "cancel", input })
            if (options.failCancel) throw new Error("already delivered")
          },
        },
      },
      message: { list: async () => ({ data: [], cursor: { next: null } }) },
    },
  } as unknown as Context
  return { context, calls }
}

test("batch parts reproduce the complete prompt, so the reconciliation hash is mode-independent", () => {
  const parts = composeBatchParts(threads)
  assert.equal(`${parts.instruction}\n\n${parts.body}`, composeBatch(threads))
  assert.equal(parts.instruction, batchInstruction(threads))
  assert.equal(parts.label, "Reply Threads · 2 comments")
  assert.equal(batchLabel(1), "Reply Threads · 1 comment")
  assert.doesNotMatch(parts.body, /Reply to each comment/, "instruction lives only in the label message")
  const { batch, prompt } = build()
  assert.equal(prompt, composeBatch(threads))
  assert.equal(batch.labelMessageID, "msg_aaa")
})

test("labeled send: synthetic label first, then the threads, both steer, label never resumes", async () => {
  const { batch, prompt, parts } = build()
  const { context, calls } = fakeContext()
  const id = await submitBatch(context, batch, prompt, parts, { labeled: true })
  assert.equal(id, "msg_abb")
  assert.deepEqual(calls.map((call) => call.op), ["synthetic", "prompt"])
  const [label, user] = calls
  assert.equal(label.input.id, "msg_aaa")
  assert.equal(label.input.text, parts.instruction, "instruction goes to the model through the label message")
  assert.equal(label.input.description, "Reply Threads · 2 comments", "label text is display-only")
  assert.equal(label.input.delivery, "steer")
  assert.equal(label.input.resume, false, "must not start a turn on its own")
  assert.equal(user.input.id, "msg_abb")
  assert.equal(user.input.text, parts.body)
  assert.equal(user.input.delivery, "steer")
  const meta = user.input.metadata as Record<string, string>
  assert.equal(meta.replyThreadsBatchID, "batch_1")
  assert.equal(meta.replyThreadsPromptHash, batch.promptHash)
})

test("busy session: one queued plain message, exactly as before", async () => {
  const { batch, prompt, parts } = build()
  const { context, calls } = fakeContext()
  await submitBatch(context, batch, prompt, parts, { labeled: false })
  assert.deepEqual(calls.map((call) => call.op), ["prompt"])
  assert.equal(calls[0].input.text, prompt)
  assert.equal(calls[0].input.delivery, "queue")
})

test("a failed label never blocks the send: cancel any half-admitted label, then send plain", async () => {
  const { batch, prompt, parts } = build()
  const { context, calls } = fakeContext({ failSynthetic: true })
  const id = await submitBatch(context, batch, prompt, parts, { labeled: true })
  assert.equal(id, "msg_abb")
  assert.deepEqual(calls.map((call) => call.op), ["synthetic", "cancel", "prompt"])
  assert.deepEqual(calls[1].input, { sessionID: "ses_1", inboxID: "msg_aaa" })
  assert.equal(calls[2].input.text, prompt, "falls back to the full single message")
  assert.equal(calls[2].input.delivery, "queue")
})

test("a failed prompt is rethrown untouched; the caller decides whether to cancel the label", async () => {
  const { batch, prompt, parts } = build()
  const { context, calls } = fakeContext({ failPrompt: true })
  await assert.rejects(() => submitBatch(context, batch, prompt, parts, { labeled: true }), /400 invalid/)
  assert.deepEqual(calls.map((call) => call.op), ["synthetic", "prompt"], "no implicit cancel on an indeterminate failure")
})

test("cancelBatchLabel targets the label's inbox item and tolerates already-delivered labels", async () => {
  const { batch } = build()
  const ok = fakeContext()
  await cancelBatchLabel(ok.context, batch)
  assert.deepEqual(ok.calls, [{ op: "cancel", input: { sessionID: "ses_1", inboxID: "msg_aaa" } }])
  const gone = fakeContext({ failCancel: true })
  await cancelBatchLabel(gone.context, batch) // must not throw
  const { batch: unlabeled } = createBatch({ id: "b", promptMessageID: "msg_x", sessionID: "ses_1", threads, now })
  const none = fakeContext()
  await cancelBatchLabel(none.context, unlabeled)
  assert.equal(none.calls.length, 0, "no label, nothing to cancel")
})

test("recovery cancels the label when reconciliation proves the prompt never arrived", async () => {
  const state = initialRepositoryState()
  for (const item of threads) addThread(state, item)
  const { batch } = build()
  beginBatch(state, batch)
  const { context, calls } = fakeContext()
  const result = await recoverSessionBatches(context, state, async (mutation) => mutation(state), "ses_1")
  assert.deepEqual(result, { sent: 0, restored: 1, uncertain: 0 })
  assert.deepEqual(calls.map((call) => call.op), ["cancel"])
  assert.equal(state.sessions.ses_1.threads[0].status, "pending", "drafts are restored")
})

test("recovery leaves the label alone when the prompt did arrive", async () => {
  const state = initialRepositoryState()
  for (const item of threads) addThread(state, item)
  const { batch } = build()
  beginBatch(state, batch)
  const { context, calls } = fakeContext()
  ;(context.client.message as unknown as { list: unknown }).list = async () => ({
    data: [{ id: "msg_abb", type: "user", text: "x", metadata: {} }],
    cursor: { next: null },
  })
  const result = await recoverSessionBatches(context, state, async (mutation) => mutation(state), "ses_1")
  assert.deepEqual(result, { sent: 1, restored: 0, uncertain: 0 })
  assert.equal(calls.length, 0)
})
