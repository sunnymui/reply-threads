import test from "node:test"
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import { createStore } from "solid-js/store"
import type { Context } from "@opencode/plugin/tui/context"
import { SidebarEntry } from "./SidebarEntry.js"
import { initialRepositoryState, type ReplyThread } from "../data/thread-types.js"

const sent = (id: string, label: string, parentThreadID?: string): ReplyThread => ({
  id, sessionID: "ses_1", label, ...(parentThreadID ? { parentThreadID } : {}), batchID: "b1",
  quote: { raw: `quote ${label}`, normalized: "" }, comment: `comment ${label}`, anchor: { confidence: "unmatched" },
  status: "sent", createdAt: "", updatedAt: "",
})
const pendingThread = (id: string): ReplyThread => ({ ...sent(id, id), status: "pending", batchID: undefined })

const answer = (id: string, text: string) => ({ id, type: "assistant", finish: "stop", content: [{ type: "text", text }] })
function fakeContext(messages: unknown[] = [], status: "idle" | "running" = "idle") {
  return { data: { session: { message: { list: () => messages }, status: () => status } } } as unknown as Context
}
function stateWith(threads: ReplyThread[]) {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads,
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: threads.map((thread) => thread.id), promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  return state
}

async function mount(state: ReturnType<typeof initialRepositoryState>, context: Context, onOpen: (id?: string) => void = () => {}) {
  const setup = await testRender(() => <SidebarEntry context={context} sessionID="ses_1" state={state} onOpen={onOpen} />, { width: 42, height: 24 })
  await setup.renderOnce()
  return setup
}
const rowY = (frame: string, needle: string) => frame.split("\n").findIndex((line) => line.includes(needle))

test("absent when the session has no threads", async () => {
  const setup = await mount(initialRepositoryState(), fakeContext())
  try { assert.doesNotMatch(setup.captureCharFrame(), /Reply Threads|Thread history/) } finally { setup.renderer.destroy() }
})

test("the sidebar appears for the first comment and disappears when the last is removed", async () => {
  const [state, setState] = createStore(initialRepositoryState())
  const setup = await mount(state, fakeContext())
  try {
    assert.doesNotMatch(setup.captureCharFrame(), /Reply Threads|Open threads/)
    setState("sessions", "ses_1", { threads: [pendingThread("p1")], batches: [] })
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /Reply Threads · 1 pending/)
    assert.match(setup.captureCharFrame(), /Open threads \(1\)/)
    setState("sessions", "ses_1", "threads", [])
    await setup.renderOnce()
    assert.doesNotMatch(setup.captureCharFrame(), /Reply Threads|Open threads/)
  } finally {
    setup.renderer.destroy()
  }
})

test("a compact tree: one line per comment, follow-ups indented, answered comments marked", async () => {
  const state = stateWith([sent("t1", "1"), sent("t2", "2"), sent("t3", "1a", "t1")])
  const setup = await mount(state, fakeContext([{ id: "u1", type: "user" }, answer("a1", "## 1\nanswer one\n## 2\nanswer two")]))
  try {
    const frame = setup.captureCharFrame()
    const line = (needle: string) => frame.split("\n").find((l) => l.includes(needle))!
    assert.match(line("comment 1"), /◈ 1 comment 1/, "answered")
    assert.match(line("comment 2"), /◈ 2 comment 2/)
    assert.match(line("comment 1a"), /· 1a comment 1a/, "no answer for this one yet")
    assert.ok(line("comment 1a").search(/\S/) > line("comment 1").search(/\S/), "follow-up is indented")
    assert.ok(rowY(frame, "comment 1a") === rowY(frame, "comment 1") + 1 || rowY(frame, "comment 1a") > rowY(frame, "comment 1"), "parent first")
    assert.match(frame, /Open threads \(3\)/)
  } finally { setup.renderer.destroy() }
})

test("a still-replying comment shows an ellipsis marker", async () => {
  const setup = await mount(stateWith([sent("t1", "1")]), fakeContext([{ id: "u1", type: "user" }], "running"))
  try { assert.match(setup.captureCharFrame(), /… 1 comment 1/) } finally { setup.renderer.destroy() }
})

test("clicking a row opens that comment; the button opens the panel from the top", async () => {
  const opened: Array<string | undefined> = []
  const setup = await mount(stateWith([sent("t1", "1"), sent("t2", "2")]), fakeContext(), (id) => { opened.push(id) })
  try {
    let frame = setup.captureCharFrame()
    let y = rowY(frame, "comment 2")
    await setup.mockMouse.click(frame.split("\n")[y].indexOf("comment 2"), y)
    assert.deepEqual(opened, ["t2"])
    frame = setup.captureCharFrame()
    y = rowY(frame, "Open threads")
    await setup.mockMouse.click(frame.split("\n")[y].indexOf("Open threads") + 2, y)
    assert.deepEqual(opened, ["t2", undefined])
  } finally { setup.renderer.destroy() }
})

test("long comments are truncated to one line, and the list is capped with a count", async () => {
  const many = Array.from({ length: 13 }, (_, i) => ({ ...sent(`t${i}`, `${i + 1}`), comment: i === 0 ? "x".repeat(200) : `comment ${i + 1}` }))
  const setup = await mount(stateWith(many), fakeContext())
  try {
    const frame = setup.captureCharFrame()
    assert.ok(frame.split("\n").every((line) => line.length <= 42))
    assert.match(frame, /\+3 more/)
    assert.doesNotMatch(frame, /comment 13/)
  } finally { setup.renderer.destroy() }
})

test("pending threads only: the title with the count, and still a button to open the panel", async () => {
  const opened: Array<string | undefined> = []
  const setup = await mount(stateWith([pendingThread("p1"), pendingThread("p2")]), fakeContext(), (id) => { opened.push(id) })
  try {
    const frame = setup.captureCharFrame()
    assert.match(frame, /Reply Threads · 2 pending/)
    assert.match(frame, /Open threads \(2\)/, "the only way to reopen the panel from the sidebar")
    assert.doesNotMatch(frame, /comment p1/, "no rows: nothing has been sent, the replies are in the panel")
    const y = rowY(frame, "Open threads")
    await setup.mockMouse.click(frame.split("\n")[y].indexOf("Open threads") + 2, y)
    assert.deepEqual(opened, [undefined])
  } finally { setup.renderer.destroy() }
})

test("hovering the Open threads button describes it and shows the shortcut, without shifting anything", async () => {
  const state = stateWith([sent("t1", "1")])
  const setup = await testRender(
    () => <SidebarEntry context={fakeContext()} sessionID="ses_1" state={state} onOpen={() => {}} />,
    { width: 36, height: 14, enableMouseMovement: true },
  )
  try {
    await setup.renderOnce()
    const before = setup.captureCharFrame()
    assert.doesNotMatch(before, /Ctrl\+L|Pending replies and sent threads/, "nothing shown until hovered")
    const y = rowY(before, "Open threads")
    const x = before.split("\n")[y].indexOf("Open threads") + 2
    await setup.mockMouse.moveTo(x, y)
    await setup.renderOnce()
    const hovered = setup.captureCharFrame()
    assert.match(hovered, /Pending replies and sent threads/)
    assert.match(hovered, /Ctrl\+L opens or closes this panel/)
    assert.equal(rowY(hovered, "Open threads"), y, "the button did not move")
    assert.ok(hovered.split("\n").every((line) => line.length <= 36), "fits the real sidebar width (about 36 columns)")
    // Leaving the button hides the description again.
    await setup.mockMouse.moveTo(40, 12)
    await setup.renderOnce()
    assert.doesNotMatch(setup.captureCharFrame(), /Ctrl\+L/)
  } finally { setup.renderer.destroy() }
})
