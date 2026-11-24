import test from "node:test"
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import { ComposerToolbar } from "./ComposerToolbar.js"
import { addThread, createThread } from "../threads/data/thread-repository.js"
import { initialRepositoryState } from "../threads/data/thread-types.js"

test("renders clickable comment-mode controls and pending count", async () => {
  const state = initialRepositoryState()
  addThread(state, createThread({
    id: "rt_1", sessionID: "ses_1", rawQuote: "quote", comment: "comment", now: "2026-10-05T00:00:00.000Z",
    attribution: { confidence: "unmatched", normalized: "quote", candidates: [] },
  }))
  const setup = await testRender(() => (
    <ComposerToolbar sessionID="ses_1" state={state} commentMode onToggleMode={() => {}} onSend={() => {}} />
  ), { width: 160, height: 4 })
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  assert.match(frame, /Reply Mode/)
  assert.doesNotMatch(frame, /Add selected text/)
  assert.doesNotMatch(frame, /Threads \(1\)|Hide threads/, "the panel is opened from the sidebar, not the toolbar")
  assert.match(frame, /Send pending replies/)
  assert.match(frame, /quote.*comment/)
  assert.match(frame, /Enter sends \(empty prompt\)/)
  const lines = frame.trimEnd().split("\n")
  assert.equal(lines.length, 3, "toolbar, pending preview, and spacing are compact")
  assert.match(lines[0], /Reply Mode.*Send pending replies.*Enter sends \(empty prompt\)/)
  setup.renderer.destroy()
})

test("Reply Mode hover hint uses the reserved row without shifting content", async () => {
  const setup = await testRender(() => (
    <box flexDirection="column">
       <ComposerToolbar sessionID="ses_1" state={initialRepositoryState()} commentMode={false} onToggleMode={() => {}} onSend={() => {}} />
      <text>Composer below</text>
    </box>
  ), { width: 100, height: 5, enableMouseMovement: true })
  try {
    await setup.renderOnce()
    const initial = setup.captureCharFrame().split("\n")
    assert.equal(initial[1].trim(), "")
    assert.match(initial[2], /Composer below/)
    await setup.mockMouse.moveTo(5, 0)
    await setup.renderOnce()
    const hovered = setup.captureCharFrame().split("\n")
    assert.match(hovered[1], /select part\(s\) of the chat response to annotate\/reply/)
    assert.match(setup.captureCharFrame(), /Composer below|1\. “quote”/)
    await setup.mockMouse.moveTo(95, 4)
    await setup.renderOnce()
    assert.equal(setup.captureCharFrame().split("\n")[1].trim(), "")
  } finally {
    setup.renderer.destroy()
  }
})

test("mouse clicks invoke composer actions", async () => {
  let toggles = 0
  const setup = await testRender(() => (
      <ComposerToolbar sessionID="ses_1" state={initialRepositoryState()} commentMode={false} onToggleMode={() => toggles++} onSend={() => {}} />
  ), { width: 80, height: 3 })
  await setup.renderOnce()
  assert.match(setup.captureCharFrame(), /Ctrl\+Y reply mode/)
  assert.doesNotMatch(setup.captureCharFrame(), /Enter submits/)
  await setup.mockMouse.click(5, 0)
  assert.equal(toggles, 1)
  setup.renderer.destroy()
})

test("the toolbar has no panel button; Send appears only with pending replies; previews use real labels", async () => {
  const mk = (id: string, label: string) => createThread({
    id, sessionID: "ses_1", rawQuote: "quote", comment: "comment", label, now: "2026-10-05T00:00:00.000Z",
    attribution: { confidence: "unmatched", normalized: "quote", candidates: [] },
  })
  const frameFor = async (state: ReturnType<typeof initialRepositoryState>) => {
    const setup = await testRender(() => (
      <ComposerToolbar sessionID="ses_1" state={state} commentMode={false} onToggleMode={() => {}} onSend={() => {}} />
    ), { width: 100, height: 6 })
    try { await setup.renderOnce(); return setup.captureCharFrame() } finally { setup.renderer.destroy() }
  }

  const sentOnly = initialRepositoryState()
  addThread(sentOnly, { ...mk("a", "1"), status: "sent" })
  const sentFrame = await frameFor(sentOnly)
  assert.match(sentFrame, /Reply Mode/)
  assert.doesNotMatch(sentFrame, /Threads \(|Hide threads|Review|Send pending replies/)

  const mixed = initialRepositoryState()
  addThread(mixed, { ...mk("a", "1"), status: "sent" })
  addThread(mixed, mk("c", "1a"))
  const mixedFrame = await frameFor(mixed)
  assert.doesNotMatch(mixedFrame, /Threads \(|Hide threads|Review/)
  assert.match(mixedFrame, /Send pending replies/)
  assert.match(mixedFrame, /1a\. “quote”/, "preview shows the thread's label, not its list position")
})
test("the Reply Mode hint mentions Enter only when there is something to send", async () => {
  const hint = async (withPending: boolean) => {
    const state = initialRepositoryState()
    if (withPending) addThread(state, createThread({
      id: "rt_1", sessionID: "ses_1", rawQuote: "quote", comment: "comment", now: "2026-10-05T00:00:00.000Z",
      attribution: { confidence: "unmatched", normalized: "quote", candidates: [] },
    }))
    const setup = await testRender(() => (
      <ComposerToolbar sessionID="ses_1" state={state} commentMode onToggleMode={() => {}} onSend={() => {}} />
    ), { width: 140, height: 6 })
    try { await setup.renderOnce(); return setup.captureCharFrame().split("\n")[0] } finally { setup.renderer.destroy() }
  }
  assert.doesNotMatch(await hint(false), /Enter sends/)
  assert.match(await hint(true), /Enter sends/)
})

test("the Ctrl+L threads hint sits next to the Ctrl+Y hint, in and out of Reply Mode", async () => {
  const hintFor = async (commentMode: boolean) => {
    const setup = await testRender(() => (
      <ComposerToolbar sessionID="ses_1" state={initialRepositoryState()} commentMode={commentMode} onToggleMode={() => {}} onSend={() => {}} />
    ), { width: 120, height: 4 })
    try { await setup.renderOnce(); return setup.captureCharFrame().split("\n")[0] } finally { setup.renderer.destroy() }
  }
  assert.match(await hintFor(false), /Ctrl\+Y reply mode · Ctrl\+L threads/)
  assert.match(await hintFor(true), /Ctrl\+Y exits · Ctrl\+L threads/)
})
