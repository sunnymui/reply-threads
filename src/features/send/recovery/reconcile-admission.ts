import type { Context } from "@opencode/plugin/tui/context"
import { reconcileBatch, type ReconciliationResult } from "./reconcile-batch.js"
import type { ReplyBatch } from "../../threads/data/thread-types.js"

/**
 * Connects the send feature’s reconciliation rules to OpenCode history. Reads paginated user
 * messages and passes them to reconcileBatch; synthetic labels are excluded so a label alone
 * cannot prove prompt admission.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @returns A promise resolving to sent with the admitted ID or absent; history-read errors
 *   reject it.
 */
export async function reconcileAdmittedBatch(context: Context, batch: ReplyBatch): Promise<ReconciliationResult> {
  const messages = []
  let cursor: string | undefined
  do {
    const page = await context.client.message.list({
      sessionID: batch.sessionID,
      limit: 100,
      ...(cursor ? { cursor } : { order: "desc" as const }),
    })
    messages.push(...page.data.flatMap((message) => message.type === "user" ? [{ id: message.id, text: message.text, metadata: message.metadata }] : []))
    if (messages.some((message) => message.id === batch.promptMessageID || message.metadata?.replyThreadsBatchID === batch.id)) break
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return reconcileBatch(batch, messages)
}
