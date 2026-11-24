import test from "node:test"
import assert from "node:assert/strict"
import type { Context } from "@opencode/plugin/tui/context"
import type { ReplyBatch } from "../../threads/data/thread-types.js"
import { reconcileAdmittedBatch } from "./reconcile-admission.js"

const batch: ReplyBatch = {
  id: "batch", sessionID: "session", threadIDs: ["thread"], promptMessageID: "prompt",
  promptHash: "hash", status: "submitting", createdAt: "", updatedAt: "",
}

test("reconciliation finds older user prompts without combining cursor and order", async () => {
  const calls: Record<string, unknown>[] = []
  const context = { client: { message: { list: async (input: Record<string, unknown>) => {
    calls.push(input)
    if (input.cursor && input.order) throw new Error("Cursor cannot be combined with order")
    return input.cursor
      ? { data: [{ id: "prompt", type: "user", text: "Comments" }], cursor: {} }
      : { data: [{ id: "label", type: "synthetic", metadata: { replyThreadsBatchID: "batch", replyThreadsPromptHash: "hash" } }], cursor: { next: "older" } }
  } } } } as unknown as Context
  assert.deepEqual(await reconcileAdmittedBatch(context, batch), { status: "sent", admittedMessageID: "prompt" })
  assert.deepEqual(calls[1], { sessionID: "session", limit: 100, cursor: "older" })
})
