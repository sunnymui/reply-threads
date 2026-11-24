import test from "node:test"
import assert from "node:assert/strict"
import { testRender } from "@opentui/solid"
import { readSelection, trackCommentSelection } from "./selection.js"

for (const action of ["keyboard", "click"] as const) {
  test(`completed selection survives host clearing before ${action} capture`, async () => {
    let captured: string | undefined
    let take = () => {}
    const setup = await testRender(() => (
      <box flexDirection="column">
        <text>Selected passage</text>
        <text selectable={false} onMouseUp={() => take()}>[ Add selected text ]</text>
      </box>
    ), { width: 80, height: 8 })
    // Simulate host copy-on-select even if it registered before the plugin.
    let copied: string | undefined
    setup.renderer.on("selection", () => {
      copied = readSelection(setup.renderer)
      setup.renderer.clearSelection()
    })
    const tracker = trackCommentSelection(setup.renderer, () => "ses_1")
    take = () => { captured = tracker.take("ses_1") }
    setup.renderer.keyInput.on("keypress", (event) => {
      setup.renderer.clearSelection()
      if (event.ctrl && event.name === "y") take()
    })
    try {
      await setup.renderOnce()
      await setup.mockMouse.drag(0, 0, 7, 0)
      assert.equal(copied, "Selected")
      assert.equal(readSelection(setup.renderer), undefined)
      if (action === "keyboard") setup.mockInput.pressKey("y", { ctrl: true })
      else await setup.mockMouse.click(5, 1)
      assert.equal(captured, "Selected")
      assert.equal(tracker.take("ses_1"), undefined, "snapshot is consumed once")
    } finally {
      tracker.dispose()
      setup.renderer.destroy()
    }
  })
}

test("selection snapshots are scoped, paused during editing, and cleaned up", async () => {
  const setup = await testRender(() => <text>Selected passage</text>, { width: 80, height: 4 })
  let session: string | undefined
  const tracker = trackCommentSelection(setup.renderer, () => session)
  try {
    await setup.renderOnce()
    await setup.mockMouse.drag(0, 0, 7, 0)
    assert.equal(tracker.take("ses_1"), undefined, "mode off")
    session = "ses_1"
    await setup.mockMouse.drag(0, 0, 7, 0)
    assert.equal(tracker.take("ses_2"), undefined, "wrong session")
    tracker.pause(true)
    await setup.mockMouse.drag(0, 0, 7, 0)
    assert.equal(tracker.take("ses_1"), undefined, "dialog text is not captured")
    tracker.pause(false)
    await setup.mockMouse.drag(0, 0, 7, 0)
    tracker.clear()
    assert.equal(tracker.take("ses_1"), undefined, "exit clears snapshot")
    const before = setup.renderer.listenerCount("selection")
    tracker.dispose()
    assert.equal(setup.renderer.listenerCount("selection"), before - 1)
  } finally {
    tracker.dispose()
    setup.renderer.destroy()
  }
})
