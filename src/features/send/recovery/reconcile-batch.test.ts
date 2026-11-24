import test from "node:test"
import assert from "node:assert/strict"
import { reconcileBatch } from "./reconcile-batch.js"
import type { ReplyBatch } from "../../threads/data/thread-types.js"

const batch: ReplyBatch = {
  id: "batch_1",
  sessionID: "ses_1",
  threadIDs: ["rt_1"],
  promptMessageID: "msg_expected",
  promptHash: "sha256:expected",
  status: "unknown",
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
}

test("reconciles by stable prompt message ID", () => {
  assert.deepEqual(reconcileBatch(batch, [{ id: "msg_expected", text: "anything" }]), {
    status: "sent",
    admittedMessageID: "msg_expected",
  })
})

test("reconciles by batch metadata and prompt hash", () => {
  assert.deepEqual(reconcileBatch(batch, [{
    id: "msg_other",
    text: "anything",
    metadata: { replyThreadsBatchID: "batch_1", replyThreadsPromptHash: "sha256:expected" },
  }]), { status: "sent", admittedMessageID: "msg_other" })
})

test("does not accept partial metadata or arbitrary matching text", () => {
  assert.deepEqual(reconcileBatch(batch, [{
    id: "msg_other",
    text: "sha256:expected",
    metadata: { replyThreadsBatchID: "batch_1" },
  }]), { status: "absent" })
})
