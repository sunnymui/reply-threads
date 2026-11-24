import type { Context } from "@opencode/plugin/tui/context"
import type { ReplyThread } from "../data/thread-types.js"
import type { UpdateRepository } from "../data/workflow-types.js"
import { removePendingThread } from "../data/thread-repository.js"

/**
 * Connects editing to the annotation workflow and owns confirmed deletion/storage feedback.
 * Selection and key bindings belong to panel-navigation.tsx, not these operations.
 *
 * @param options - Host APIs, repository writer, current selection/session and deletion callback.
 * @returns Async editSelected and deleteSelected actions for the navigation key bindings.
 */
export function createPendingThreadActions(options: {
  context: Context
  updateState: UpdateRepository
  getSessionID: () => string
  getSelectedThread: () => ReplyThread | undefined
  onEditThread?: (threadID: string) => void
  onDeleted: () => void
}) {
  /**
   * Delegates the selected pending comment to the right-hand annotation editor.
   *
   * @returns A promise resolving after requesting the inline edit.
   */
  const editSelected = async () => {
    const thread = options.getSelectedThread()
    if (!thread) return
    options.onEditThread?.(thread.id)
  }

  /**
   * Confirms deletion of a particular pending comment and repairs selection after removal.
   *
   * @param thread - Comment targeted by its card button or the keyboard selection.
   * @returns A promise resolving after cancellation, deletion or a handled repository error.
   */
  const discardThread = async (thread: ReplyThread) => {
    if (thread.status !== "pending") return
    const confirmed = await options.context.ui.dialog.confirm({ title: "Delete reply thread?", message: thread.quote.raw, label: { confirm: "Delete" } })
    if (!confirmed) return
    try {
      await options.updateState((draft) => removePendingThread(draft, options.getSessionID(), thread.id))
      options.onDeleted()
      options.context.ui.toast.show({ message: "Reply thread deleted.", variant: "success" })
    } catch (error) {
      options.context.ui.toast.show({ message: error instanceof Error ? error.message : "Could not delete reply thread.", variant: "error" })
    }
  }

  const deleteSelected = async () => {
    const thread = options.getSelectedThread()
    if (thread) await discardThread(thread)
  }

  return { editSelected, deleteSelected, discardThread }
}
