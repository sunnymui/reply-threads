import type { Context } from "@opencode/plugin/tui/context"
import { batchMetadata, type BatchParts } from "../preparation/compose-prompt.js"
import type { ReplyBatch } from "../../threads/data/thread-types.js"

/**
 * Admits one persisted batch to OpenCode. Idle sessions use the two-message labeled steer flow;
 * busy sessions and label failures use one queued prompt.
 *
 * The caller must persist intent first and select labeled mode only while idle. Both labeled
 * messages use steer; the synthetic instruction uses resume:false. If its admission fails,
 * cancel the label and send one queued prompt. Errors from prompt admission propagate to send-
 * workflow.ts for definite-versus-unknown classification.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @param prompt - Complete logical instruction-plus-body text used for admission or hashing.
 * @param parts - Instruction, visible body and display label from prompt composition.
 * @param options - Whether to use the idle-only labeled flow; false selects one queued prompt.
 * @returns A promise resolving to OpenCode’s admitted user-prompt ID; prompt-admission failures
 *   reject it.
 */
export async function submitBatch(
  context: Context,
  batch: ReplyBatch,
  prompt: string,
  parts: BatchParts,
  options: { labeled: boolean },
): Promise<string> {
  const metadata = batchMetadata(batch.id, batch.promptHash)

  if (options.labeled && batch.labelMessageID) {
    let labelAdmitted = true
    try {
      await context.client.session.synthetic({
        sessionID: batch.sessionID,
        id: batch.labelMessageID,
        text: parts.instruction,
        description: parts.label,
        metadata,
        delivery: "steer",
        resume: false,
      })
    } catch {
      labelAdmitted = false
      // The label is cosmetic: never let it block the send. If it was
      // half-admitted, cancel it so it cannot leak, then send the plain message.
      await cancelBatchLabel(context, batch)
    }
    if (labelAdmitted) {
      // A failure here is deliberately NOT cleaned up in this function: only the
      // caller knows whether the failure is definite (cancel the label) or
      // indeterminate (the prompt may be admitted and the label consumed with it).
      const admitted = await context.client.session.prompt({
        sessionID: batch.sessionID,
        id: batch.promptMessageID,
        text: parts.body,
        delivery: "steer",
        metadata,
      })
      return admitted.id
    }
  }

  const admitted = await context.client.session.prompt({
    sessionID: batch.sessionID,
    id: batch.promptMessageID,
    text: prompt,
    delivery: "queue",
    metadata,
  })
  return admitted.id
}

/**
 * Removes the display-only synthetic label when a prompt is definitively rejected or proven
 * absent.
 *
 * Safe when no label was created or when it has already been consumed. Cancellation errors are
 * swallowed because this is best-effort cleanup; do not use it for indeterminate prompt
 * admission.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @returns A promise resolving after best-effort label cancellation, including when nothing can
 *   be cancelled.
 */
export async function cancelBatchLabel(context: Context, batch: ReplyBatch): Promise<void> {
  if (!batch.labelMessageID) return
  try {
    await context.client.session.inbox.cancel({ sessionID: batch.sessionID, inboxID: batch.labelMessageID })
  } catch {
    // already delivered, never admitted, or unreachable: nothing more to do
  }
}
