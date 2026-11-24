import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import type { Context } from "@opencode/plugin/tui/context"
import { testRender } from "@opentui/solid"
import { createAnnotationWorkflow } from "./annotation-workflow.js"
import { AnnotationEditor } from "./editor/AnnotationEditor.js"
import { initialRepositoryState, type ThreadRepositoryState } from "../threads/data/thread-types.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function harness() {
  const state = initialRepositoryState()
  const renderer = Object.assign(new EventEmitter(), { getSelection: () => undefined, clearSelection() {}, isDestroyed: false })
  let sessionID = "first-session"
  let history: Promise<{ data: []; cursor: Record<string, never> }> = Promise.resolve({ data: [], cursor: {} })
  let storageFailure = false
  let storageBarrier: Promise<void> | undefined
  let completionBarrier: Promise<void> | undefined
  let writes = 0
  const notifications: string[] = []
  const context = {
    renderer,
    client: { message: { list: () => history } },
    data: { session: { message: { list: () => [] } } },
    keymap: { layer() {}, dispatch() {} },
    ui: { panel: { open() {}, current: () => undefined }, toast: { show: (input: { message: string }) => notifications.push(input.message) } },
  } as unknown as Context
  const updateState = async (mutation: (draft: ThreadRepositoryState) => void) => {
    writes++
    if (storageBarrier) await storageBarrier
    if (storageFailure) throw new Error("Storage write failed")
    mutation(state)
    if (completionBarrier) await completionBarrier
  }
  const workflow = createAnnotationWorkflow({ context, state, updateState, activeSessionID: () => sessionID, clearPanelFocus() {} })
  return {
    workflow, state, context, notifications,
    writes: () => writes,
    switchSession: (next: string) => { sessionID = next; workflow.resetForSession() },
    delayHistory: (next: typeof history) => { history = next },
    delayStorage: (next: Promise<void>) => { storageBarrier = next },
    delayCompletion: (next: Promise<void>) => { completionBarrier = next },
    failStorage: (fail: boolean) => { storageFailure = fail },
  }
}

test("saving blocks duplicate submissions and keeps the owning session", async () => {
  const h = harness()
  const history = deferred<{ data: []; cursor: Record<string, never> }>()
  h.delayHistory(history.promise)
  try {
    h.workflow.replyToThread("parent", "Selected answer")
    const saving = h.workflow.saveComment("One comment")
    assert.equal(h.workflow.isSaving(), true)
    assert.equal(h.workflow.enterSends(), false)
    await h.workflow.saveComment("Duplicate comment")
    history.resolve({ data: [], cursor: {} })
    await saving
    assert.equal(h.writes(), 1)
    assert.deepEqual(h.state.sessions["first-session"].threads.map((thread) => thread.comment), ["One comment"])
    assert.equal(h.workflow.isAnnotating(), false)
  } finally { h.workflow.dispose() }
})

test("cancelling a delayed save cannot write or close the next draft", async () => {
  const h = harness()
  const history = deferred<{ data: []; cursor: Record<string, never> }>()
  h.delayHistory(history.promise)
  try {
    h.workflow.replyToThread("parent", "Old answer")
    const saving = h.workflow.saveComment("Cancelled comment")
    h.workflow.cancelAnnotation()
    h.workflow.replyToThread("next-parent", "New answer")
    history.resolve({ data: [], cursor: {} })
    await saving
    assert.equal(h.writes(), 0)
    assert.equal(h.workflow.quotedText(), "New answer")
    assert.equal(h.workflow.parentThreadID(), "next-parent")
    assert.equal(h.workflow.isSaving(), false)
    assert.deepEqual(h.state.sessions, {})
  } finally { h.workflow.dispose() }
})

test("switching sessions clears the draft and prevents a delayed storage mutation", async () => {
  const h = harness()
  const storage = deferred<void>()
  h.delayStorage(storage.promise)
  try {
    h.workflow.replyToThread("parent", "Old session answer")
    const saving = h.workflow.saveComment("Old session comment")
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(h.writes(), 1)
    h.switchSession("second-session")
    assert.equal(h.workflow.isAnnotating(), false)
    assert.equal(h.workflow.replyModeEnabled(), false)
    h.workflow.replyToThread("second-parent", "Second session answer")
    storage.resolve()
    await saving
    assert.deepEqual(h.state.sessions, {})
    assert.equal(h.workflow.quotedText(), "Second session answer")
  } finally { h.workflow.dispose() }
})

test("completion of an already committed save cannot close a newer draft", async () => {
  const h = harness()
  const completion = deferred<void>()
  h.delayCompletion(completion.promise)
  try {
    h.workflow.replyToThread("parent", "Saved answer")
    const saving = h.workflow.saveComment("Already committed")
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(h.state.sessions["first-session"].threads[0].comment, "Already committed")
    h.workflow.cancelAnnotation()
    h.workflow.replyToThread("new-parent", "New draft")
    completion.resolve()
    await saving
    assert.equal(h.workflow.quotedText(), "New draft")
    assert.equal(h.workflow.isSaving(), false)
  } finally { h.workflow.dispose() }
})

test("unloading the workflow invalidates a save still reading history", async () => {
  const h = harness()
  const history = deferred<{ data: []; cursor: Record<string, never> }>()
  h.delayHistory(history.promise)
  h.workflow.replyToThread("parent", "Quoted answer")
  const saving = h.workflow.saveComment("Do not write after unload")
  h.workflow.dispose()
  history.resolve({ data: [], cursor: {} })
  await saving
  assert.equal(h.writes(), 0)
  assert.equal(h.workflow.isAnnotating(), false)
})

test("save failure retains typed input and a retry saves that same comment", async () => {
  const h = harness()
  h.failStorage(true)
  const setup = await testRender(() => <box>{h.workflow.quotedText() ? (
    <AnnotationEditor
      context={h.context} quote={h.workflow.quotedText()!} initialComment={h.workflow.initialComment()}
      isSaving={h.workflow.isSaving()} onSaveCapture={h.workflow.saveComment}
      onCancelCapture={h.workflow.cancelAnnotation} onEditorReady={h.workflow.registerEditor}
    />
  ) : <text>No annotation</text>}</box>, { width: 90, height: 30 })
  try {
    h.workflow.replyToThread("parent", "Quoted answer")
    await setup.renderOnce()
    await setup.mockInput.typeText("Keep this text")
    setup.mockInput.pressEnter()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await setup.renderOnce()
    assert.equal(h.workflow.isSaving(), false)
    assert.equal(h.workflow.isAnnotating(), true)
    assert.match(setup.captureCharFrame(), /Keep this text/)
    assert.ok(h.notifications.includes("Storage write failed"))
    h.failStorage(false)
    setup.mockInput.pressEnter()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await setup.renderOnce()
    assert.equal(h.workflow.isAnnotating(), false)
    assert.equal(h.state.sessions["first-session"].threads[0].comment, "Keep this text")
  } finally {
    h.workflow.dispose()
    setup.renderer.destroy()
  }
})
