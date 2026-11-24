import test from "node:test"
import assert from "node:assert/strict"
import type { Context } from "@opencode/plugin/tui/context"
import { initialRepositoryState } from "./data/thread-types.js"
import { loadThreadRepository } from "./thread-storage.js"
import { createThread, addThread } from "./data/thread-repository.js"

function storageHarness(initial: unknown) {
  const stored = structuredClone(initial) as Record<string, unknown>
  let writes = 0
  const context = { storage: { store: () => [stored, async (mutation: (draft: unknown) => void) => {
    const draft = structuredClone(stored)
    mutation(draft)
    Object.assign(stored, draft)
    writes++
  }] } } as unknown as Pick<Context, "storage">
  return { context, stored, writes: () => writes }
}

test("valid repositories load as live views and writes retain unknown fields", async () => {
  const h = storageHarness({ ...initialRepositoryState(), extraMetadata: "keep me" })
  const loaded = loadThreadRepository(h.context)
  assert.equal(loaded.repository, h.stored)
  assert.equal(h.writes(), 0)
  await loaded.updateRepository((draft) => addThread(draft, createThread({
    id: "thread", sessionID: "session", rawQuote: "Quote", comment: "Comment", now: "",
    attribution: { confidence: "unmatched", normalized: "Quote", candidates: [] },
  })))
  assert.equal(h.stored.extraMetadata, "keep me")
  assert.equal(loaded.repository.sessions.session.threads[0].comment, "Comment")
})

test("a missing legacy revision is initialized without replacing saved threads", async () => {
  const initial = initialRepositoryState()
  addThread(initial, createThread({ id: "legacy", sessionID: "session", rawQuote: "Quote", comment: "Comment", now: "", attribution: { confidence: "unmatched", normalized: "Quote", candidates: [] } }))
  const { revision: _revision, ...legacy } = initial
  const h = storageHarness(legacy)
  const loaded = loadThreadRepository(h.context)
  assert.equal(loaded.repository.revision, 0)
  assert.equal(loaded.repository.sessions.session.threads[0].id, "legacy")
  assert.equal(h.writes(), 0, "normalization does not require asynchronous plugin setup")
  await loaded.updateRepository((draft) => { draft.revision++ })
  assert.equal(h.writes(), 1)
  assert.equal(loaded.repository.revision, 1)
})

test("unsupported or malformed saved data is reported without writes", async () => {
  for (const saved of [{ schemaVersion: 2, revision: 0, sessions: {} }, { schemaVersion: 1, revision: 0, sessions: null }]) {
    const h = storageHarness(saved)
    assert.throws(() => loadThreadRepository(h.context), /Saved Reply Threads data is incompatible/)
    assert.deepEqual(h.stored, saved)
    assert.equal(h.writes(), 0)
  }
})

test("invalid mutations and externally corrupted data cannot be written", async () => {
  const h = storageHarness(initialRepositoryState())
  const loaded = loadThreadRepository(h.context)
  await assert.rejects(loaded.updateRepository((draft) => { draft.revision = -1 }), /revision/)
  assert.equal(loaded.repository.revision, 0)
  assert.equal(h.writes(), 0)
  h.stored.schemaVersion = 99
  let mutated = false
  await assert.rejects(loaded.updateRepository(() => { mutated = true }), /schemaVersion/)
  assert.equal(mutated, false)
})

test("host proxy metadata is excluded from JSON validation without replacing the live view", () => {
  const live = initialRepositoryState()
  const tracking = Symbol("host tracking metadata")
  Object.defineProperty(live.sessions, tracking, { value: true, enumerable: true })
  const context = { storage: { store: () => [live, async () => {}] } } as unknown as Pick<Context, "storage">
  const loaded = loadThreadRepository(context)
  assert.equal(loaded.repository, live)
  assert.ok(Reflect.ownKeys(live.sessions).includes(tracking))
})

test("a malformed saved comment is rejected at the load boundary", () => {
  const initial = initialRepositoryState()
  const thread = createThread({ id: "thread", sessionID: "session", rawQuote: "Quote", comment: "Comment", now: "", attribution: { confidence: "unmatched", normalized: "Quote", candidates: [] } })
  Object.assign(thread, { comment: null })
  initial.sessions.session = { threads: [thread], batches: [] }
  const h = storageHarness(initial)
  assert.throws(() => loadThreadRepository(h.context), /sessions\.session\.threads\.0\.comment/)
  assert.equal(h.writes(), 0)
  assert.deepEqual(h.stored, initial)
})
