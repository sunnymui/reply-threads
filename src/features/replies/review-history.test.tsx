import test from "node:test"
import assert from "node:assert/strict"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"
import type { Context } from "@opencode/plugin/tui/context"
import type { ReplyBatch } from "../threads/data/thread-types.js"
import { createReviewHistory } from "./review-history.js"
import type { HistoryMessage } from "./reply-history.js"

const batch = (sessionID: string, promptMessageID: string): ReplyBatch => ({
  id: promptMessageID, sessionID, promptMessageID, promptHash: "hash", threadIDs: [],
  status: "sent", createdAt: "", updatedAt: "",
})

test("failed history refresh keeps older answers and session changes cannot leak them", async () => {
  const [sessionID, setSessionID] = createSignal("first")
  const [batches, setBatches] = createSignal([batch("first", "old")])
  let fail = false
  const context = {
    client: { message: { list: async (input: { sessionID: string }) => {
      if (fail) throw new Error("offline")
      return { data: [{ id: `${input.sessionID}-answer`, type: "assistant", content: [{ type: "text", text: "Retained answer" }] }, { id: "old", type: "user" }], cursor: {} }
    } } },
    data: { session: { message: { list: (id: string) => [{ id: `${id}-live`, type: "user" }] } } },
  } as unknown as Context
  let history: (() => HistoryMessage[]) | undefined
  const setup = await testRender(() => {
    history = createReviewHistory({ context, sessionID, batches })
    return <text>{history().map((message) => message.id).join(", ")}</text>
  }, { width: 80, height: 5 })
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.ok(history!().some((message) => message.id === "first-answer"))
    fail = true
    setBatches([batch("first", "old"), batch("first", "new")])
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.ok(history!().some((message) => message.id === "first-answer"), "a partial cache fallback cannot erase complete history")
    setSessionID("second")
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(history!().map((message) => message.id), ["second-live"])
  } finally {
    setup.renderer.destroy()
  }
})
