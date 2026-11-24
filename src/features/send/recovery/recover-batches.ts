import type { Context } from "@opencode/plugin/tui/context"
import { reconcileAdmittedBatch } from "./reconcile-admission.js"
import { cancelBatchLabel } from "../submission/submit-batch.js"
import { markBatchFailed, markBatchSent, recoverableBatches } from "../../threads/data/thread-repository.js"
import type { ThreadRepositoryState } from "../../threads/data/thread-types.js"

/**
 * Reconciles submitting or unknown batches when a session becomes active, marking admitted
 * prompts sent and restoring batches proven absent.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param updateState - Host transactional writer that validates and mutates one repository
 *   draft.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns Counts of sent, restored and still-uncertain batches after attempted reconciliation.
 */
export async function recoverSessionBatches(
  context: Context,
  state: ThreadRepositoryState,
  updateState: (mutation: (draft: ThreadRepositoryState) => void) => Promise<void>,
  sessionID: string,
): Promise<{ sent: number; restored: number; uncertain: number }> {
  const result = { sent: 0, restored: 0, uncertain: 0 }
  for (const batch of [...recoverableBatches(state, sessionID)]) {
    try {
      const reconciliation = await reconcileAdmittedBatch(context, batch)
      // Proven absent: the real prompt never arrived, so a still-pending label
      // would leak into the next prompt. Cancel it.
      if (reconciliation.status === "absent") await cancelBatchLabel(context, batch)
      const now = new Date().toISOString()
      await updateState((draft) => {
        const current = draft.sessions[sessionID]?.batches.find((item) => item.id === batch.id)
        if (!current || (current.status !== "submitting" && current.status !== "unknown")) return
        if (reconciliation.status === "sent") markBatchSent(draft, sessionID, batch.id, reconciliation.admittedMessageID, now)
        else markBatchFailed(draft, sessionID, batch.id, now)
      })
      if (reconciliation.status === "sent") result.sent++
      else result.restored++
    } catch {
      result.uncertain++
    }
  }
  return result
}
