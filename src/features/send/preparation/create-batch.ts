import { composeBatchParts, promptHash, type BatchParts } from "./compose-prompt.js"
import type { ReplyBatch, ReplyThread } from "../../threads/data/thread-types.js"

/**
 * Builds a submitting batch record and the send feature’s deterministic prompt parts. This
 * constructs intent only; send-workflow.ts must persist it with beginBatch before calling
 * submitBatch.
 *
 * @param input - Batch/prompt/optional-label IDs, session ID, ordered pending threads and
 *   creation timestamp.
 * @returns The submitting record, full logical prompt and split instruction/body/display parts,
 *   without persisting them.
 */
export function createBatch(input: {
  id: string
  promptMessageID: string
  labelMessageID?: string
  sessionID: string
  threads: readonly ReplyThread[]
  now: string
}): { batch: ReplyBatch; prompt: string; parts: BatchParts } {
  const parts = composeBatchParts(input.threads)
  // Hash the complete logical prompt so it is identical whether the send is
  // labeled (two messages) or plain (one), keeping reconciliation unaffected.
  const prompt = `${parts.instruction}\n\n${parts.body}`
  return {
    prompt,
    parts,
    batch: {
      id: input.id,
      sessionID: input.sessionID,
      threadIDs: input.threads.map((thread) => thread.id),
      promptMessageID: input.promptMessageID,
      ...(input.labelMessageID ? { labelMessageID: input.labelMessageID } : {}),
      promptHash: promptHash(prompt),
      status: "submitting",
      createdAt: input.now,
      updatedAt: input.now,
    },
  }
}
