import test from "node:test"
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import { trackCommentSelection } from "./selection.js"

test("reply-mode selection invokes capture immediately", async () => {
  const setup = await testRender(() => <text>Selectable response text</text>, { width: 80, height: 4 })
  let captured: string | undefined
  const tracker = trackCommentSelection(setup.renderer, () => "ses_1", (_sessionID, quote) => { captured = quote })
  try {
    await setup.renderOnce()
    await setup.mockMouse.drag(0, 0, 10, 0)
    assert.equal(captured?.trim(), "Selectable")
  } finally {
    tracker.dispose()
    setup.renderer.destroy()
  }
})
