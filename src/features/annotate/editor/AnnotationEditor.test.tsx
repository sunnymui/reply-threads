import test from "node:test"
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import { AnnotationEditor } from "./AnnotationEditor.js"

test("panel editor continues an existing comment, Ctrl+J inserts a newline, and Enter saves", async () => {
  let saved: string | undefined
  const context = { keymap: { layer() {} } } as unknown as Context
  const setup = await testRender(() => (
    <AnnotationEditor
      context={context} quote="quoted passage" initialComment="existing comment"
      onSaveCapture={async (comment) => { saved = comment }}
    />
  ), { width: 100, height: 30 })
  try {
    await setup.renderOnce()
    assert.match(setup.captureCharFrame(), /Enter saves · Ctrl\+J new line · Esc cancels/)
    await setup.mockInput.typeText(" updated")
    setup.mockInput.pressKey("j", { ctrl: true })
    await setup.mockInput.typeText("second line")
    setup.mockInput.pressEnter()
    assert.equal(saved, "existing comment updated\nsecond line")
  } finally {
    setup.renderer.destroy()
  }
})
