import type { ReplyBatch } from "../../threads/data/thread-types.js"

export interface ReconciliationMessage {
  id: string
  text: string
  metadata?: Record<string, unknown>
}

export type ReconciliationResult =
  | { status: "sent"; admittedMessageID: string }
  | { status: "absent" }

/**
 * Decides whether the prompt for a stored batch appears in the supplied user-message history,
 * matching its planned message ID first and batch/hash metadata second. Unreadable history is
 * handled by the calling recovery workflow, not represented as an unknown result here.
 *
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @param messages - User messages loaded by reconcile-admission.ts; synthetic labels must not be
 *   included.
 * @returns Sent with the matched message ID, or absent when no matching user message exists.
 */
export function reconcileBatch(batch: ReplyBatch, messages: readonly ReconciliationMessage[]): ReconciliationResult {
  const exact = messages.find((message) => message.id === batch.promptMessageID)
  if (exact) return { status: "sent", admittedMessageID: exact.id }

  const metadataMatch = messages.find((message) =>
    message.metadata?.replyThreadsBatchID === batch.id
    && message.metadata?.replyThreadsPromptHash === batch.promptHash,
  )
  if (metadataMatch) return { status: "sent", admittedMessageID: metadataMatch.id }
  return { status: "absent" }
}
