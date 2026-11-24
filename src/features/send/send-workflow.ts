import type { Context } from "@opencode/plugin/tui/context"
import type { ThreadRepositoryState } from "../threads/data/thread-types.js"
import type { UpdateRepository } from "../threads/data/workflow-types.js"
import { createBatch } from "./preparation/create-batch.js"
import { cancelBatchLabel, submitBatch } from "./submission/submit-batch.js"
import { recoverSessionBatches } from "./recovery/recover-batches.js"
import { assignMissingLabels, beginBatch, markBatchFailed, markBatchSent, markBatchUnknown, pendingThreads, recoverableBatches } from "../threads/data/thread-repository.js"

/**
 * Owns the send feature’s app-facing actions, in-flight send guard and automatic reconciliation
 * lifecycle. Uses threads repository transitions for durable state and send-local modules for
 * composition, admission and recovery.
 *
 * @param options - Host APIs, threads repository/writer and active-session accessor from
 *   app/TuiPlugin.tsx.
 * @returns Send and reconcile actions plus startRecovery, which returns host-listener cleanup.
 */
export function createSendWorkflow(options: {
  context: Context
  state: ThreadRepositoryState
  updateState: UpdateRepository
  activeSessionID: () => string | undefined
}) {
  const { context, state, updateState, activeSessionID } = options

  /**
   * Persists and submits all pending threads, handling labeled idle sends, failures and unknown
   * admission results.
   *
   * @returns A promise resolving after admission handling or a no-pending notification; unexpected
   *   pre-admission/storage errors reject it.
   */
  const sendNow = async () => {
    const sessionID = activeSessionID()
    if (!sessionID) return
    if (pendingThreads(state, sessionID).some((thread) => !thread.label)) {
      await updateState((draft) => assignMissingLabels(draft, sessionID))
    }
    const threads = pendingThreads(state, sessionID)
    if (threads.length === 0) {
      context.ui.toast.show({ message: "There are no pending reply threads.", variant: "info" })
      return
    }
    const now = new Date().toISOString()
    const suffix = crypto.randomUUID().replaceAll("-", "")
    // Label ID sorts before the prompt ID so the label can never be ordered after it.
    const { batch, prompt, parts } = createBatch({
      id: `batch_${suffix}`,
      promptMessageID: `msg_${suffix}b`,
      labelMessageID: `msg_${suffix}a`,
      sessionID,
      threads,
      now,
    })
    // The labeled two-message send needs steer delivery, which would inject
    // into a running turn. Only use it when idle; otherwise keep one queued message.
    const idle = context.data.session.status(sessionID) === "idle"
    await updateState((draft) => beginBatch(draft, batch))
    try {
      const admittedMessageID = await submitBatch(context, batch, prompt, parts, { labeled: idle })
      const sentAt = new Date().toISOString()
      await updateState((draft) => markBatchSent(draft, sessionID, batch.id, admittedMessageID, sentAt))
      context.ui.toast.show({ message: "Reply threads sent.", variant: "success" })
    } catch (error) {
      const failedAt = new Date().toISOString()
      const definite = error instanceof Error && /400|401|404|409|invalid|not found|unauthorized|conflict/i.test(error.message)
      // A definitely-rejected prompt must not leave its label pending, or the
      // instruction line would be consumed by the user's next, unrelated prompt.
      if (definite) await cancelBatchLabel(context, batch)
      await updateState((draft) => {
        if (definite) markBatchFailed(draft, sessionID, batch.id, failedAt)
        else markBatchUnknown(draft, sessionID, batch.id, failedAt)
      })
      context.ui.toast.show({
        message: definite ? "Prompt was rejected; drafts were restored." : "Submission result is unknown; drafts remain locked for reconciliation.",
        variant: "error",
      })
    }
  }

  // Enter and the button can both fire quickly; never run two sends at once.
  let sendInFlight = false

  /**
   * Serializes send invocations so keyboard and mouse actions cannot submit the same batch twice.
   *
   * @returns A promise for the current send invocation, or an immediately resolved promise when
   *   another send is in flight.
   */
  const send = async () => {
    if (sendInFlight) return
    sendInFlight = true
    try {
      await sendNow()
    } finally {
      sendInFlight = false
    }
  }

  /**
   * Manually reconciles recoverable batches for the active session.
   *
   * @returns A promise resolving after active-session recovery and its result notification.
   */
  const reconcile = async () => {
    const sessionID = activeSessionID()
    if (!sessionID) return
    const batches = [...recoverableBatches(state, sessionID)]
    if (batches.length === 0) {
      context.ui.toast.show({ message: "There are no uncertain reply-thread batches.", variant: "info" })
      return
    }

    const result = await recoverSessionBatches(context, state, updateState, sessionID)
    if (result.uncertain > 0) {
      context.ui.toast.show({ message: `${result.uncertain} batches remain uncertain and locked.`, variant: "warning" })
      return
    }
    context.ui.toast.show({ message: `Reconciled batches: ${result.sent} sent, ${result.restored} restored.`, variant: "success" })
  }

  let recovering = false

  /**
   * Attempts recovery for the currently active session while excluding overlapping recovery runs.
   * startRecovery invokes it initially and on host data events.
   *
   * @returns A promise resolving after recovery or a no-work/overlap check; unexpected errors
   *   propagate.
   */
  const recoverCurrentSession = async () => {
    const sessionID = activeSessionID()
    if (!sessionID || recovering || recoverableBatches(state, sessionID).length === 0) return
    recovering = true
    try {
      const result = await recoverSessionBatches(context, state, updateState, sessionID)
      if (result.sent + result.restored > 0) {
        context.ui.toast.show({ message: `Recovered ${result.sent + result.restored} interrupted reply-thread batches.`, variant: "success" })
      }
    } finally {
      recovering = false
    }
  }
  return {
    send, reconcile,
    startRecovery() {
      const dispose = context.data.listen(() => { void recoverCurrentSession() })
      void recoverCurrentSession()
      return dispose
    },
  }
}
