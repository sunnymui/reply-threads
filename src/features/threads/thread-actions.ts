import type { Context } from "@opencode/plugin/tui/context"
import type { ThreadRepositoryState } from "./data/thread-types.js"
import type { UpdateRepository } from "./data/workflow-types.js"
import { pendingThreads, clearPendingThreads } from "./data/thread-repository.js"

/**
 * Owns threads-management actions requiring host confirmation and storage writes. The app passes
 * the returned actions into its command registration; repository mutation rules stay in thread-
 * repository.ts.
 *
 * @param options - Host dialogs/toasts, threads repository/writer and app-provided current-
 *   session accessor.
 * @returns The confirmed clear-pending action consumed by app command wiring.
 */
export function createThreadActions(options: {
  context: Context
  state: ThreadRepositoryState
  updateState: UpdateRepository
  activeSessionID: () => string | undefined
}) {
  const { context, state, updateState, activeSessionID } = options

  /**
   * Confirms and removes pending threads while preserving sent history.
   *
   * @returns A promise resolving after confirmation, cancellation, or a handled removal error.
   */
  const clear = async () => {
    const sessionID = activeSessionID()
    if (!sessionID) return
    const count = pendingThreads(state, sessionID).length
    if (count === 0) {
      context.ui.toast.show({ message: "There are no pending reply threads.", variant: "info" })
      return
    }
    const confirmed = await context.ui.dialog.confirm({
      title: "Clear pending reply threads?",
      message: `Delete ${count} pending ${count === 1 ? "thread" : "threads"}? Sent history will be retained.`,
      label: { confirm: "Clear", cancel: "Cancel" },
    })
    if (!confirmed) return
    try {
      let removed = 0
      await updateState((draft) => { removed = clearPendingThreads(draft, sessionID) })
      context.ui.toast.show({ message: `Cleared ${removed} pending ${removed === 1 ? "thread" : "threads"}.`, variant: "success" })
    } catch (error) {
      context.ui.toast.show({ message: error instanceof Error ? error.message : "Could not clear pending threads.", variant: "error" })
    }
  }
  return { clear }
}
