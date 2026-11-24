import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { testRender } from "@opentui/solid"
import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import type { TextareaRenderable } from "@opentui/core"
import { createMutable } from "solid-js/store"
import { ThreadPanel } from "./ThreadPanel.js"
import { addThread, createThread } from "../data/thread-repository.js"
import { initialRepositoryState } from "../data/thread-types.js"
import { createAnnotationWorkflow } from "../../annotate/annotation-workflow.js"

type Layer = () => { commands?: Array<{ bind?: string | false; enabled?: boolean | (() => boolean); run?: () => unknown }> }

function harness() {
  const layers: Layer[] = []
  const context = {
    keymap: { layer: (factory: Layer) => { layers.push(factory) } },
    ui: { dialog: {}, toast: { show() {} } },
  } as unknown as Context
  const panel = { sessionID: "ses_1", focus() {}, close() {} } as unknown as PanelInput
  const enabled = (bind: string) => {
    const command = layers.flatMap((layer) => layer().commands ?? []).find((item) => item.bind === bind)
    return typeof command?.enabled === "function" ? command.enabled() : command?.enabled ?? true
  }
  const run = async (bind: string) => {
    const command = layers.flatMap((layer) => layer().commands ?? []).find((item) => item.bind === bind)
    assert.ok(command, `binding ${bind} is registered`)
    if (enabled(bind)) await command.run?.()
  }
  return { context, panel, enabled, run }
}

const thread = (id: string, status: "pending" | "sent" = "pending") => ({
  ...createThread({
    id, sessionID: "ses_1", rawQuote: `quote ${id}`, comment: `comment ${id}`, now: "2026-10-05T00:00:00.000Z",
    attribution: { confidence: "unmatched" as const, normalized: id, candidates: [] },
  }),
  status,
})

test("sidebar annotation accepts typing, disables panel shortcuts, and saves", async () => {
  const state = initialRepositoryState()
  const h = harness()
  let saved: string | undefined
  const setup = await testRender(() => (
    <ThreadPanel
      context={h.context}
      panel={h.panel}
      state={state}
      updateState={async () => {}}
      captureQuote="selected response"
      onSaveCapture={async (comment) => { saved = comment }}
    />
  ), { width: 80, height: 24 })
  try {
    await setup.renderOnce()
    // The quoted response text, a divider and the input must be visually distinct.
    const layout = setup.captureCharFrame()
    assert.match(layout, /Reply to this part of the response/)
    assert.match(layout, /┃ selected response/, "quote has an accent bar")
    assert.match(layout, /─{10,}/, "divider separates quote from input")
    assert.match(layout, /Your reply/)
    assert.match(layout, /Enter saves · Ctrl\+J new line · Esc cancels/)
    // These are the keys the panel used to steal while typing.
    assert.equal(h.enabled("e"), false)
    assert.equal(h.enabled("d"), false)
    await setup.mockInput.typeText("edit down")
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    assert.match(frame, /edit down/)
    const lines = frame.split("\n")
    const y = lines.findIndex((line) => line.includes("Save reply"))
    await setup.mockMouse.click(lines[y].indexOf("Save reply") + 2, y)
    assert.equal(saved, "edit down")
    saved = undefined
    // Enter saves too, and Ctrl+J starts a new line instead.
    setup.mockInput.pressKey("j", { ctrl: true })
    await setup.mockInput.typeText("more")
    setup.mockInput.pressEnter()
    assert.equal(saved, "edit down\nmore")
  } finally {
    setup.renderer.destroy()
  }
})

test("clicking into the annotation editor restores typing after the host steals focus", async () => {
  const h = harness()
  let cancelled = 0
  const setup = await testRender(() => (
    <ThreadPanel
      context={h.context}
      panel={h.panel}
      state={initialRepositoryState()}
      updateState={async () => {}}
      captureQuote="selected response"
      onSaveCapture={async () => {}}
      onCancelCapture={() => { cancelled++ }}
    />
  ), { width: 80, height: 24 })
  try {
    await setup.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 10))
    // Host panels claim focus on mouse-down, which blurs the editor.
    const editor = setup.renderer.currentFocusedRenderable
    editor?.blur()
    await setup.mockInput.typeText("lost")
    await setup.renderOnce()
    assert.doesNotMatch(setup.captureCharFrame(), /lost/)
    const editorRow = setup.captureCharFrame().split("\n").findIndex((line) => line.includes("Your reply")) + 1
    await setup.mockMouse.click(10, editorRow)
    const focusDeadline = Date.now() + 250
    while (setup.renderer.currentFocusedRenderable !== editor && Date.now() < focusDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(setup.renderer.currentFocusedRenderable, editor)
    await setup.mockInput.typeText("kept")
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /kept/)

    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("Cancel"))
    await setup.mockMouse.click(lines[y].indexOf("Cancel") + 1, y)
    assert.equal(cancelled, 1)
    // Esc is handled by the editor itself, so the panel never has to claim host focus.
    await setup.mockInput.typeText("x")
    setup.mockInput.pressEscape()
    await new Promise((resolve) => setTimeout(resolve, 80))
    await setup.renderOnce()
    assert.equal(cancelled, 2)
  } finally {
    setup.renderer.destroy()
  }
})

for (const comment of ["", "Do not save this"]) test(`Cancel discards a ${comment ? "typed" : "blank"} selection annotation and permits a fresh capture`, async () => {
  const state = initialRepositoryState()
  const h = harness()
  const renderer = Object.assign(new EventEmitter(), { clearSelection() {}, isDestroyed: false })
  Object.assign(h.context, { renderer })
  Object.assign(h.context.ui, { panel: { open() {}, current: () => undefined } })
  let annotation: ReturnType<typeof createAnnotationWorkflow> | undefined
  const setup = await testRender(() => {
    annotation = createAnnotationWorkflow({
      context: h.context, state, updateState: async (mutation) => { mutation(state) },
      activeSessionID: () => "ses_1", clearPanelFocus() {},
    })
    return (
      <ThreadPanel
        context={h.context} panel={h.panel} state={state} updateState={async () => {}}
        captureQuote={annotation.quotedText()} onCancelCapture={annotation.cancelAnnotation}
      />
    )
  }, { width: 80, height: 30 })
  try {
    assert.ok(annotation)
    annotation.toggleReplyMode()
    renderer.emit("selection", { getSelectedText: () => "Highlighted assistant text" })
    await setup.renderOnce()
    if (comment) await setup.mockInput.typeText(comment)
    await setup.renderOnce()
    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("Cancel"))
    await setup.mockMouse.click(lines[y].indexOf("Cancel") + 2, y)
    await setup.renderOnce()
    assert.equal(annotation.isAnnotating(), false)
    assert.equal(annotation.parentThreadID(), undefined)
    assert.equal(Object.keys(state.sessions).length, 0, "cancel does not create a saved comment")
    assert.doesNotMatch(setup.captureCharFrame(), /Your reply|Do not save this/)
    renderer.emit("selection", { getSelectedText: () => "A fresh excerpt" })
    await setup.renderOnce()
    assert.equal(annotation.quotedText(), "A fresh excerpt", "selection capture resumes after Cancel")
    assert.match(setup.captureCharFrame(), /Your reply/)
  } finally {
    annotation?.dispose()
    setup.renderer.destroy()
  }
})

test("pending and sent threads share one view, labelled when both exist", async () => {
  const state = initialRepositoryState()
  addThread(state, thread("rt_pending"))
  addThread(state, thread("rt_sent", "sent"))
  const h = harness()
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
  ), { width: 80, height: 30 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    assert.match(frame, /Reply Threads · 1 pending · 1 sent/)
    assert.match(frame, /quote rt_pending/)
    assert.match(frame, /quote rt_sent/, "sent threads are always visible: there is no toggle")
    assert.match(frame, /Pending · 1/)
    assert.match(frame, /Sent · 1/)
    assert.ok(frame.indexOf("quote rt_pending") < frame.indexOf("quote rt_sent"), "pending first")
    assert.doesNotMatch(frame, /Show thread history|Hide thread history/)
    assert.equal(h.enabled("e"), true)
  } finally {
    setup.renderer.destroy()
  }
})

test("section labels appear only when both pending and sent threads exist", async () => {
  const h = harness()
  for (const [threads, expectLabels] of [[[thread("a")], false], [[thread("b", "sent")], false], [[thread("a"), thread("b", "sent")], true]] as const) {
    const state = initialRepositoryState()
    for (const item of threads) addThread(state, item)
    const setup = await testRender(() => (
      <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
    ), { width: 80, height: 24 })
    try {
      await setup.renderOnce()
      assert.equal(/Pending · |Sent · /.test(setup.captureCharFrame()), expectLabels)
    } finally {
      setup.renderer.destroy()
    }
  }
})

test("keyboard deletion follows selection, respects cancellation, and selects a remaining pending card", async () => {
  const state = createMutable(initialRepositoryState())
  for (const item of [thread("first"), thread("second"), thread("history", "sent")]) addThread(state, item)
  const h = harness()
  let confirmed = false
  const prompts: string[] = []
  h.context.ui.dialog.confirm = async (options) => { prompts.push(options.message); return confirmed }
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async (mutation) => { mutation(state) }} />
  ), { width: 80, height: 40 })
  try {
    await setup.renderOnce()
    await h.run("down")
    await h.run("down") // Clamp at the last pending comment, before sent history.
    await h.run("d")
    assert.equal(state.sessions.ses_1.threads.length, 3, "cancel leaves the selected comment intact")
    confirmed = true
    await h.run("d")
    assert.deepEqual(prompts, ["quote second", "quote second"])
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => item.id), ["first", "history"])
    await h.run("d")
    assert.equal(prompts.at(-1), "quote first", "selection is repaired after deleting the last pending card")
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => item.id), ["history"])
    assert.equal(h.enabled("e"), false)
    assert.equal(h.enabled("d"), false)
  } finally {
    setup.renderer.destroy()
  }
})

test("Discard targets its own pending card and is hidden for sending and sent comments", async () => {
  const state = createMutable(initialRepositoryState())
  for (const item of [thread("first"), thread("second"), { ...thread("locked"), status: "sending" as const }, thread("history", "sent")]) addThread(state, item)
  const h = harness()
  let confirmed = false
  const prompts: string[] = []
  h.context.ui.dialog.confirm = async (options) => { prompts.push(options.message); return confirmed }
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async (mutation) => { mutation(state) }} />
  ), { width: 80, height: 60 })
  try {
    await setup.renderOnce()
    const lines = setup.captureCharFrame().split("\n")
    const buttons = lines.flatMap((line, y) => line.includes("Discard") ? [y] : [])
    assert.equal(buttons.length, 2, "only editable pending comments have a Discard button")
    const y = buttons[1]
    await setup.mockMouse.click(lines[y].indexOf("Discard") + 2, y)
    assert.equal(state.sessions.ses_1.threads.length, 4, "cancelled confirmation leaves the comment intact")
    confirmed = true
    await setup.mockMouse.click(lines[y].indexOf("Discard") + 2, y)
    assert.deepEqual(prompts, ["quote second", "quote second"], "the clicked card is used instead of the keyboard selection")
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => item.id), ["first", "locked", "history"])
  } finally {
    setup.renderer.destroy()
  }
})

test("app-scoped Enter binding targets each new editor across consecutive selections", async () => {
  const h = harness()
  const notifications: string[] = []
  h.context.ui.toast.show = (input) => { notifications.push(input.message) }
  const initial = initialRepositoryState()
  initial.sessions.ses_1 = { threads: [], batches: [] }
  const state = createMutable(initial)
  const renderer = Object.assign(new EventEmitter(), { clearSelection() {}, isDestroyed: false })
  Object.assign(h.context, { renderer })
  Object.assign(h.context.ui, { panel: { open() {}, current: () => undefined } })
  let annotation: ReturnType<typeof createAnnotationWorkflow> | undefined
  let editorLayer: (() => { target?: () => TextareaRenderable | undefined; enabled?: () => boolean; commands?: Array<{ bind?: string | false; run: () => unknown }> }) | undefined
  const updateState = async (mutation: (draft: typeof state) => void) => { mutation(state) }
  const setup = await testRender(() => {
    annotation = createAnnotationWorkflow({ context: h.context, state, updateState, activeSessionID: () => "ses_1", clearPanelFocus() {} })
    // The real app registers this before rendering its panel slot. Capture the
    // same long-lived layer, then let each conditional editor mount/unmount.
    h.context.keymap.layer = (factory) => { editorLayer = factory as typeof editorLayer }
    annotation.registerEditorKeys()
    h.context.keymap.layer = () => {}
    return (
      <ThreadPanel
        context={h.context} panel={h.panel} state={state} updateState={updateState}
        captureQuote={annotation.quotedText()} onEditorReady={annotation.registerEditor}
        onCancelCapture={annotation.cancelAnnotation}
      />
    )
  }, { width: 80, height: 50 })
  try {
    assert.ok(annotation)
    assert.ok(editorLayer)
    annotation.toggleReplyMode()
    let previousEditor: TextareaRenderable | undefined
    for (const comment of ["first", "second", "third"]) {
      renderer.emit("selection", { getSelectedText: () => `quote ${comment}` })
      await setup.renderOnce()
      const layer = editorLayer()
      const currentEditor = layer.target?.()
      assert.ok(currentEditor)
      assert.notEqual(currentEditor, previousEditor, "a fresh editor becomes the key target")
      assert.equal(layer.enabled?.(), true)
      await setup.mockInput.typeText(comment)
      layer.commands?.find((command) => command.bind === "return")?.run()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await setup.renderOnce()
      assert.equal(annotation.isAnnotating(), false)
      assert.equal(state.sessions.ses_1?.threads.at(-1)?.comment, comment, notifications.join("\n"))
      assert.equal(editorLayer().target?.(), undefined, "unmount releases the old target")
      assert.equal(editorLayer().enabled?.(), false)
      previousEditor = currentEditor
    }
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => item.comment), ["first", "second", "third"])
  } finally {
    annotation?.dispose()
    setup.renderer.destroy()
  }
})

test("keyboard editing uses the panel input, cancels without changes, then saves the same thread", async () => {
  const state = createMutable(initialRepositoryState())
  for (const id of ["first", "second"]) addThread(state, thread(id))
  const h = harness()
  Object.assign(h.context, { renderer: Object.assign(new EventEmitter(), { clearSelection() {}, isDestroyed: false }) })
  Object.assign(h.context.ui, { panel: { open() {}, current: () => undefined } })
  let annotation: ReturnType<typeof createAnnotationWorkflow> | undefined
  const updateState = async (mutation: (draft: typeof state) => void) => { mutation(state) }
  const setup = await testRender(() => {
    annotation = createAnnotationWorkflow({ context: h.context, state, updateState, activeSessionID: () => "ses_1", clearPanelFocus() {} })
    return (
      <ThreadPanel
        context={h.context} panel={h.panel} state={state} updateState={updateState}
        captureQuote={annotation.quotedText()} captureInitialComment={annotation.initialComment()}
        onEditPending={annotation.editPendingThread} onCancelCapture={annotation.cancelAnnotation}
        onSaveCapture={annotation.saveComment}
      />
    )
  }, { width: 80, height: 40 })
  try {
    await setup.renderOnce()
    await h.run("down")
    await h.run("e")
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /Your reply/)
    assert.equal(h.enabled("e"), false, "cannot open a second edit while annotating")
    await setup.mockInput.typeText(" discarded")
    const clickAction = async (label: string) => {
      await setup.renderOnce()
      const lines = setup.captureCharFrame().split("\n")
      const y = lines.findIndex((line) => line.includes(label))
      await setup.mockMouse.click(lines[y].indexOf(label) + 2, y)
      await setup.renderOnce()
    }
    await clickAction("Cancel")
    assert.equal(state.sessions.ses_1.threads[1].comment, "comment second")
    await h.run("e")
    await setup.renderOnce()
    await setup.mockInput.typeText(" updated")
    await clickAction("Save reply")
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => [item.id, item.comment]), [["first", "comment first"], ["second", "comment second updated"]])
    assert.equal(annotation?.isAnnotating(), false)
  } finally {
    annotation?.dispose()
    setup.renderer.destroy()
  }
})

function historyContext(messages: unknown[], status: "idle" | "running" = "idle") {
  const h = harness()
  ;(h.context as unknown as { data: unknown }).data = {
    session: { message: { list: () => messages }, status: () => status },
  }
  return h
}

test("the add command opens the right-hand editor for the renderer selection", async () => {
  const h = harness()
  const renderer = Object.assign(new EventEmitter(), {
    getSelection: () => ({ getSelectedText: () => "Selected for /thread" }),
    clearSelection() {}, isDestroyed: false,
  })
  Object.assign(h.context, { renderer })
  let opened = 0
  Object.assign(h.context.ui, { panel: { open() { opened++ }, current: () => undefined } })
  let annotation: ReturnType<typeof createAnnotationWorkflow> | undefined
  const state = initialRepositoryState()
  const setup = await testRender(() => {
    annotation = createAnnotationWorkflow({ context: h.context, state, updateState: async () => {}, activeSessionID: () => "ses_1", clearPanelFocus() {} })
    return <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} captureQuote={annotation.quotedText()} />
  }, { width: 80, height: 30 })
  try {
    await annotation!.commentOnSelection()
    await setup.renderOnce()
    assert.equal(opened, 1)
    assert.match(setup.captureCharFrame(), /Selected for \/thread/)
    assert.match(setup.captureCharFrame(), /Your reply/)
    assert.equal(annotation!.isAnnotating(), true)
    await annotation!.commentOnSelection()
    assert.equal(opened, 1, "a second add does not replace an open annotation")
  } finally {
    annotation?.dispose()
    setup.renderer.destroy()
  }
})

const labeled = (id: string, label: string, batchID: string, parentThreadID?: string) => ({
  ...thread(id, "sent"), label, batchID, sentAt: "2026-10-05T00:00:00.000Z",
  ...(parentThreadID ? { parentThreadID } : {}),
})
const reply = (id: string, text: string) => ({ id, type: "assistant", finish: "stop", content: [{ type: "text", text }] })

test("discard preserves sent batches and answers when the host cache drops their older messages", async () => {
  const state = createMutable(initialRepositoryState())
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1"), labeled("t2", "2", "b2"), thread("pending")],
    batches: [
      { id: "b1", sessionID: "ses_1", threadIDs: ["t1"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" },
      { id: "b2", sessionID: "ses_1", threadIDs: ["t2"], promptMessageID: "u2", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" },
    ],
  }
  const full = [{ id: "u1", type: "user" }, reply("a1", "Older answer remains available."), { id: "u2", type: "user" }, reply("a2", "Newer answer remains available.")]
  let cached = full
  const h = harness()
  Object.assign(h.context, {
    data: { session: { message: { list: () => cached }, status: () => "idle" } },
    client: { message: { list: async (input: { cursor?: string; order?: string }) => {
      assert.ok(!(input.cursor && input.order))
      return input.cursor ? { data: full.slice(0, 2).toReversed(), cursor: {} }
        : { data: full.slice(2).toReversed(), cursor: { next: "older" } }
    } } },
  })
  h.context.ui.dialog.confirm = async () => true
  const batchesBefore = JSON.stringify(state.sessions.ses_1.batches)
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async (mutation) => { mutation(state) }} />
  ), { width: 90, height: 50 })
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /Older answer remains available/)
    cached = full.slice(2)
    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("Discard"))
    await setup.mockMouse.click(lines[y].indexOf("Discard") + 2, y)
    await setup.renderOnce()
    assert.deepEqual(state.sessions.ses_1.threads.map((item) => item.id), ["t1", "t2"])
    assert.equal(JSON.stringify(state.sessions.ses_1.batches), batchesBefore)
    assert.match(setup.captureCharFrame(), /Older answer remains available/)
    assert.match(setup.captureCharFrame(), /Newer answer remains available/)
    assert.doesNotMatch(setup.captureCharFrame(), /not in the loaded history/)
  } finally {
    setup.renderer.destroy()
  }
})

test("sent threads render as a tree with the model's answer under the exact comment", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1"), labeled("t2", "2", "b1"), labeled("t3", "1a", "b2", "t1")],
    batches: [
      { id: "b1", sessionID: "ses_1", threadIDs: ["t1", "t2"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" },
      { id: "b2", sessionID: "ses_1", threadIDs: ["t3"], promptMessageID: "u2", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" },
    ],
  }
  const h = historyContext([
    { id: "u1", type: "user" }, reply("a1", "## 1\nAnswer to the first comment.\n## 2\nAnswer to the second."),
    { id: "u2", type: "user" }, reply("a2", "Follow-up answer without headings."),
  ])
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
  ), { width: 80, height: 60 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    assert.match(frame, /Reply Threads · 3 sent/)
    for (const text of ["Answer to the first comment.", "Answer to the second.", "Follow-up answer without headings.", "follows up on 1"]) {
      assert.match(frame, new RegExp(text.replace(/\./g, "\\.")), text)
    }
    // Order is depth-first: 1, then its follow-up 1a, then 2.
    const order = ["comment t1", "comment t3", "comment t2"].map((needle) => frame.indexOf(needle))
    assert.ok(order.every((index) => index >= 0) && order[0] < order[1] && order[1] < order[2], `tree order ${order.join(", ")}`)
    // The follow-up is indented under its parent.
    const rowsOf = frame.split("\n")
    const indent = (needle: string) => rowsOf.find((line) => line.includes(needle))!.search(/\S/)
    assert.ok(indent("comment t3") > indent("comment t1"), "follow-up is indented")
  } finally {
    setup.renderer.destroy()
  }
})

test("a long model reply is collapsed and expands when clicked", async () => {
  const state = initialRepositoryState()
  const long = `## 1\n${"alpha beta gamma delta ".repeat(30)}THE-END`
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1")],
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: ["t1"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  const h = historyContext([{ id: "u1", type: "user" }, reply("a1", long)])
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
  ), { width: 80, height: 60 })
  try {
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /click to read all/)
    assert.doesNotMatch(setup.captureCharFrame(), /THE-END/)
    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("click to read all"))
    await setup.mockMouse.click(lines[y].indexOf("click to read all") + 2, y)
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /THE-END/)
    assert.match(setup.captureCharFrame(), /click to collapse/)
  } finally {
    setup.renderer.destroy()
  }
})

test("reply states are shown plainly: still replying, and not in the loaded history", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1")],
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: ["t1"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  for (const [messages, status, expected] of [
    [[{ id: "u1", type: "user" }], "running", /Model is replying/],
    [[], "idle", /not in the loaded history/],
  ] as const) {
    const h = historyContext([...messages], status)
    const setup = await testRender(() => (
      <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
    ), { width: 80, height: 40 })
    try {
      await setup.renderOnce()
      assert.match(setup.captureCharFrame(), expected)
    } finally {
      setup.renderer.destroy()
    }
  }
})

test("pending cards show their label and which comment they follow up on", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1"), { ...thread("t2", "pending"), label: "1a", parentThreadID: "t1" }],
    batches: [],
  }
  const h = historyContext([])
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} />
  ), { width: 80, height: 30 })
  try {
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /1a · follows up on 1/)
  } finally {
    setup.renderer.destroy()
  }
})


test("opening at a comment scrolls to it, highlights it, and expands its reply", async () => {
  const state = initialRepositoryState()
  const many = Array.from({ length: 12 }, (_, i) => labeled(`t${i}`, `${i + 1}`, "b1"))
  state.sessions.ses_1 = {
    threads: many,
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: many.map((t) => t.id), promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  const text = `${"alpha beta gamma delta ".repeat(30)}LAST-WORD`
  const h = historyContext([{ id: "u1", type: "user" }, reply("a1", `## 1\nfirst\n## 12\n${text}`)])
  const mountAt = async (focus?: string) => {
    const setup = await testRender(() => (
      <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} focusThreadID={focus} />
    ), { width: 80, height: 24 })
    await setup.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 150))
    await setup.renderOnce()
    return setup
  }
  const plain = await mountAt()
  try {
    assert.doesNotMatch(plain.captureCharFrame(), /comment t11/, "the 12th comment is below the fold without a focus")
  } finally { plain.renderer.destroy() }
  const focused = await mountAt("t11")
  try {
    const frame = focused.captureCharFrame()
    assert.match(frame, /comment t11/, "scrolled to it, even though its expanded reply is taller than the panel")
    assert.ok(frame.split("\n").findIndex((line) => line.includes("comment t11")) < 8, "its card is at the top of the panel")
    assert.match(frame, /click to collapse/, "its reply starts expanded")
  } finally { focused.renderer.destroy() }
})

test("the panel has its own Hide threads button at the top", async () => {
  const h = harness()
  let closed = 0
  const panel = { sessionID: "ses_1", focus() {}, close() { closed++ } } as unknown as PanelInput
  const state = initialRepositoryState()
  addThread(state, thread("a"))
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={panel} state={state} updateState={async () => {}} />
  ), { width: 80, height: 20 })
  try {
    await setup.renderOnce()
    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("Hide threads"))
    assert.ok(y >= 0 && y <= 2, `button is in the header row, found at row ${y}`)
    assert.match(lines[y], /Reply Threads · 1 pending/, "same row as the title")
    await setup.mockMouse.click(lines[y].indexOf("Hide threads") + 2, y)
    assert.equal(closed, 1)
  } finally {
    setup.renderer.destroy()
  }
})

test("Hide threads while annotating discards the annotation, like Esc, then closes", async () => {
  const h = harness()
  const order: string[] = []
  const panel = { sessionID: "ses_1", focus() {}, close() { order.push("close") } } as unknown as PanelInput
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={panel} state={initialRepositoryState()} updateState={async () => {}} captureQuote="selected" onCancelCapture={() => { order.push("cancel") }} />
  ), { width: 80, height: 24 })
  try {
    await setup.renderOnce()
    const lines = setup.captureCharFrame().split("\n")
    const y = lines.findIndex((line) => line.includes("Hide threads"))
    await setup.mockMouse.click(lines[y].indexOf("Hide threads") + 2, y)
    assert.deepEqual(order, ["cancel", "close"])
  } finally {
    setup.renderer.destroy()
  }
})

/** Rows whose only content (ignoring box-drawing) is the Reply button label. */
const replyButtonRows = (frame: string) =>
  frame.split("\n").flatMap((line, y) => (line.replace(/[│┃╭╮╰╯─█▀▄]/g, "").trim() === "Reply" ? [y] : []))

test("an answered comment has a Reply button at the bottom that hands over the whole answer as the quote", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1"), labeled("t2", "2", "b1")],
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: ["t1", "t2"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  const answer = "The **full** answer to one.\n\nSecond paragraph with `code`."
  const h = historyContext([{ id: "u1", type: "user" }, reply("a1", `## 1\n${answer}\n## 2\nAnswer two.`)])
  const calls: Array<[string, string]> = []
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} onReplyTo={(id, quote) => { calls.push([id, quote]) }} />
  ), { width: 80, height: 40 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    const lines = frame.split("\n")
    const rows = replyButtonRows(frame)
    assert.equal(rows.length, 2, "one Reply button per answered comment")
    assert.ok(rows[0] > lines.findIndex((line) => line.includes("Second paragraph")), "at the bottom of the card, below the answer")
    assert.ok(rows[0] < lines.findIndex((line) => line.includes("comment t2")), "inside the first card")
    await setup.mockMouse.click(lines[rows[0]].indexOf("Reply") + 1, rows[0])
    assert.deepEqual(calls, [["t1", answer]], "the whole answer, as source text, for the right comment")
  } finally {
    setup.renderer.destroy()
  }
})

test("no Reply button where there is no answer to reply to", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1", "b1"), labeled("t2", "2", "b1")],
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: ["t1", "t2"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  const buttonsFor = async (messages: unknown[], status: "idle" | "running") => {
    const h = historyContext(messages, status)
    const setup = await testRender(() => (
      <ThreadPanel context={h.context} panel={h.panel} state={state} updateState={async () => {}} onReplyTo={() => {}} />
    ), { width: 80, height: 40 })
    try { await setup.renderOnce(); return replyButtonRows(setup.captureCharFrame()).length } finally { setup.renderer.destroy() }
  }
  assert.equal(await buttonsFor([{ id: "u1", type: "user" }], "running"), 0, "still replying")
  assert.equal(await buttonsFor([], "idle"), 0, "not in the loaded history")
  assert.equal(await buttonsFor([{ id: "u1", type: "user" }, reply("a1", "## 1\nonly this")], "idle"), 1, "the comment the model skipped has no button")
})

test("the Reply button hides while an annotation is open, and the editor says what is being answered", async () => {
  const state = initialRepositoryState()
  state.sessions.ses_1 = {
    threads: [labeled("t1", "1a", "b1")],
    batches: [{ id: "b1", sessionID: "ses_1", threadIDs: ["t1"], promptMessageID: "u1", promptHash: "h", status: "sent", createdAt: "", updatedAt: "" }],
  }
  const h = historyContext([{ id: "u1", type: "user" }, reply("a1", "## 1a\nthe answer")])
  const setup = await testRender(() => (
    <ThreadPanel
      context={h.context} panel={h.panel} state={state} updateState={async () => {}}
      captureQuote="the answer" captureParentID="t1" onReplyTo={() => {}}
    />
  ), { width: 80, height: 40 })
  try {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    assert.match(frame, /Replying to 1a: the whole reply is quoted/)
    assert.doesNotMatch(frame, /Reply to this part of the response/)
    assert.equal(replyButtonRows(frame).length, 0, "no second annotation can be started from inside the first")
  } finally {
    setup.renderer.destroy()
  }
})

test("a plain selection keeps its original editor heading", async () => {
  const h = harness()
  const setup = await testRender(() => (
    <ThreadPanel context={h.context} panel={h.panel} state={initialRepositoryState()} updateState={async () => {}} captureQuote="picked text" />
  ), { width: 80, height: 24 })
  try {
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /Reply to this part of the response/)
  } finally {
    setup.renderer.destroy()
  }
})
