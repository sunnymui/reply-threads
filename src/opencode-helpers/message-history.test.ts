import test from "node:test"
import assert from "node:assert/strict"
import type { Context } from "@opencode/plugin/tui/context"
import { mergeHistory, readHistorySnapshot } from "./message-history.js"

test("history pagination sends order only on the first page", async () => {
  const calls: Record<string, unknown>[] = []
  const context = {
    client: { message: { list: async (input: Record<string, unknown>) => {
      calls.push(input)
      if (input.cursor && input.order) throw new Error("Cursor cannot be combined with order")
      return input.cursor
        ? { data: [{ id: "old", type: "user" }], cursor: {} }
        : { data: [{ id: "new", type: "assistant", content: [{ type: "text", text: "Answer" }] }], cursor: { next: "older" } }
    } } },
  } as unknown as Context
  const result = await readHistorySnapshot(context, "session")
  assert.equal(result.complete, true)
  assert.deepEqual(result.messages.map((message) => message.id), ["old", "new"])
  assert.deepEqual(calls, [
    { sessionID: "session", limit: 100, order: "desc" },
    { sessionID: "session", limit: 100, cursor: "older" },
  ])
})

test("failed pagination retains fetched messages and marks the cache fallback partial", async () => {
  const context = {
    client: { message: { list: async (input: { cursor?: string }) => {
      if (input.cursor) throw new Error("offline")
      return { data: [{ id: "older", type: "user" }], cursor: { next: "next" } }
    } } },
    data: { session: { message: { list: () => [{ id: "live", type: "assistant", content: [] }] } } },
  } as unknown as Context
  const result = await readHistorySnapshot(context, "session")
  assert.equal(result.complete, false)
  assert.deepEqual(result.messages.map((message) => message.id), ["older", "live"])
})

test("live history updates replace matching messages without removing older turns", () => {
  const result = mergeHistory(
    [{ id: "prompt", type: "user" }, { id: "answer", type: "assistant", content: [{ type: "text", text: "Partial" }] }],
    [{ id: "answer", type: "assistant", content: [{ type: "text", text: "Complete" }] }, { id: "next", type: "user" }],
  )
  assert.deepEqual(result.map((message) => message.id), ["prompt", "answer", "next"])
  assert.equal(result[1].content?.[0].text, "Complete")
})
