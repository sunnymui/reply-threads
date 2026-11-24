import test from "node:test"
import assert from "node:assert/strict"
import { createBatch } from "./create-batch.js"
import { addThread, beginBatch, createThread, markBatchFailed, markBatchSent, markBatchUnknown, pendingThreads } from "../../threads/data/thread-repository.js"
import { initialRepositoryState } from "../../threads/data/thread-types.js"

const now = "2026-10-05T00:00:00.000Z"
function setup() {
  const state = initialRepositoryState()
  const thread = createThread({
    id: "rt_1", sessionID: "ses_1", rawQuote: "quote", comment: "comment", now,
    attribution: { confidence: "unmatched", normalized: "quote", candidates: [] },
  })
  addThread(state, thread)
  const result = createBatch({ id: "batch_1", promptMessageID: "msg_1", sessionID: "ses_1", threads: [thread], now })
  return { state, ...result }
}

test("begins and completes a durable batch", () => {
  const { state, batch } = setup()
  beginBatch(state, batch)
  assert.equal(state.sessions.ses_1.threads[0].status, "sending")
  markBatchSent(state, "ses_1", batch.id, "msg_1", now)
  assert.equal(state.sessions.ses_1.threads[0].status, "sent")
  assert.equal(state.sessions.ses_1.batches[0].admittedMessageID, "msg_1")
})

test("definite failure restores pending threads", () => {
  const { state, batch } = setup()
  beginBatch(state, batch)
  markBatchFailed(state, "ses_1", batch.id, now)
  assert.equal(pendingThreads(state, "ses_1").length, 1)
  assert.equal(state.sessions.ses_1.threads[0].batchID, undefined)
})

test("unknown admission leaves threads locked and prevents another batch", () => {
  const { state, batch } = setup()
  beginBatch(state, batch)
  markBatchUnknown(state, "ses_1", batch.id, now)
  assert.equal(state.sessions.ses_1.threads[0].status, "sending")
  assert.throws(() => beginBatch(state, { ...batch, id: "batch_2", promptMessageID: "msg_2" }), /in flight/)
})

test("concurrent batch claims serialize against current state", () => {
  const { state, batch } = setup()
  const competing = { ...batch, id: "batch_2", promptMessageID: "msg_2" }
  beginBatch(state, batch)
  assert.throws(() => beginBatch(state, competing), /in flight/)
  assert.equal(state.sessions.ses_1.batches.length, 1)
})
