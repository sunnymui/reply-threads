import test from "node:test"
import assert from "node:assert/strict"
import { addThread, beginBatch, createThread } from "./thread-repository.js"
import { createBatch } from "../../send/preparation/create-batch.js"
import { initialRepositoryState, type ThreadRepositoryState } from "./thread-types.js"

class SerializedStore {
  readonly state: ThreadRepositoryState = initialRepositoryState()
  #tail = Promise.resolve()

  update(mutation: (draft: ThreadRepositoryState) => void): Promise<void> {
    const work = this.#tail.then(() => mutation(this.state))
    this.#tail = work.catch(() => undefined)
    return work
  }
}

function thread(id: string) {
  return createThread({
    id, sessionID: "ses_1", rawQuote: id, comment: id, now: "2026-10-05T00:00:00.000Z",
    attribution: { confidence: "unmatched", normalized: id, candidates: [] },
  })
}

test("serialized cross-instance additions preserve both threads", async () => {
  const store = new SerializedStore()
  await Promise.all([
    store.update((draft) => addThread(draft, thread("rt_a"))),
    store.update((draft) => addThread(draft, thread("rt_b"))),
  ])
  assert.deepEqual(store.state.sessions.ses_1.threads.map((item) => item.id), ["rt_a", "rt_b"])
  assert.equal(store.state.revision, 2)
})

test("serialized concurrent sends admit only one batch claim", async () => {
  const store = new SerializedStore()
  const item = thread("rt_a")
  await store.update((draft) => addThread(draft, item))
  const first = createBatch({ id: "batch_a", promptMessageID: "msg_a", sessionID: "ses_1", threads: [item], now: item.createdAt }).batch
  const second = createBatch({ id: "batch_b", promptMessageID: "msg_b", sessionID: "ses_1", threads: [item], now: item.createdAt }).batch
  const results = await Promise.allSettled([
    store.update((draft) => beginBatch(draft, first)),
    store.update((draft) => beginBatch(draft, second)),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"])
  assert.equal(store.state.sessions.ses_1.batches.length, 1)
})
