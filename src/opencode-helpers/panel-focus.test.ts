import test from "node:test"
import assert from "node:assert/strict"
import type { Context } from "@opencode/plugin/tui/context"
import { releasePanelFocus } from "./panel-focus.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

test("releases panel focus with the host's own pane.focus.left command, after a tick", async () => {
  const dispatched: string[] = []
  releasePanelFocus({ keymap: { dispatch: (id: string) => { dispatched.push(id) } } } as unknown as Pick<Context, "keymap">)
  assert.deepEqual(dispatched, [], "deferred, so the closing editor is already out of the tree")
  await tick()
  assert.deepEqual(dispatched, ["pane.focus.left"])
})

test("a host without that command is a harmless no-op", async () => {
  const context = { keymap: { dispatch: () => { throw new Error("unknown command") } } } as unknown as Pick<Context, "keymap">
  assert.doesNotThrow(() => releasePanelFocus(context))
  await tick() // must not surface as an unhandled error
})
