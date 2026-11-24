import test from "node:test"
import assert from "node:assert/strict"
import { addThread, clearPendingThreads, createThread, pendingThreads, removePendingThread, updatePendingComment } from "./thread-repository.js"
import { initialRepositoryState } from "./thread-types.js"

const now = "2026-10-05T00:00:00.000Z"
const make = (id = "rt_1") => createThread({
  id,
  sessionID: "ses_1",
  rawQuote: "Selected text",
  comment: "Clarify it",
  attribution: { confidence: "exact", normalized: "Selected text", messageID: "msg_1", contentIndex: 0, start: 2, end: 15, candidates: [] },
  now,
})

test("creates and stores a pending exact thread", () => {
  const state = initialRepositoryState()
  const thread = make()
  addThread(state, thread)
  assert.equal(pendingThreads(state, "ses_1").length, 1)
  assert.equal(thread.messageID, "msg_1")
})

test("rejects duplicate IDs across sessions", () => {
  const state = initialRepositoryState()
  addThread(state, make())
  assert.throws(() => addThread(state, { ...make(), sessionID: "ses_2" }), /Duplicate/)
})

test("edits and removes only pending threads", () => {
  const state = initialRepositoryState()
  addThread(state, make())
  updatePendingComment(state, "ses_1", "rt_1", "Updated", "2026-10-05T00:01:00.000Z")
  assert.equal(pendingThreads(state, "ses_1")[0].comment, "Updated")
  removePendingThread(state, "ses_1", "rt_1")
  assert.equal(pendingThreads(state, "ses_1").length, 0)
})

test("validates quote and comment", () => {
  assert.throws(() => createThread({ id: "rt_2", sessionID: "ses_1", rawQuote: "", comment: "c", attribution: { confidence: "unmatched", normalized: "", candidates: [] }, now }), /quote/)
  assert.throws(() => createThread({ id: "rt_2", sessionID: "ses_1", rawQuote: "q", comment: " ", attribution: { confidence: "unmatched", normalized: "q", candidates: [] }, now }), /comment/)
})

test("clears only pending threads and retains sent history", () => {
  const state = initialRepositoryState()
  const pending = make("rt_pending")
  const sent = { ...make("rt_sent"), status: "sent" as const, batchID: "batch_1", sentAt: now }
  addThread(state, pending)
  addThread(state, sent)
  assert.equal(clearPendingThreads(state, "ses_1"), 1)
  assert.deepEqual(state.sessions.ses_1.threads.map((thread) => thread.id), ["rt_sent"])
})
