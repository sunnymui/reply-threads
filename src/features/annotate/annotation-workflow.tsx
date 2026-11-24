import type { Context } from "@opencode/plugin/tui/context"
import type { ThreadRepositoryState } from "../threads/data/thread-types.js"
import type { UpdateRepository } from "../threads/data/workflow-types.js"
import type { TextareaRenderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { readHistory, toSourceMessages } from "../../opencode-helpers/message-history.js"
import { releasePanelFocus } from "../../opencode-helpers/panel-focus.js"
import { readSelection, trackCommentSelection } from "./capture/selection.js"
import { captureThread } from "./capture/capture-thread.js"
import { resolveParent, type ParentLink } from "../replies/parent-resolution.js"
import { pendingThreads, updatePendingComment } from "../threads/data/thread-repository.js"
import { THREAD_PANEL } from "../threads/panel/panel-id.js"
import { createAnnotationState, type AnnotationDraft } from "./annotation-state.js"

/**
 * Connects the annotation state machine to selection, persistence, panel focus and editor keys.
 * Each draft belongs to the session where it opened; stale saves cannot close a newer editor.
 *
 * @param options - Host APIs, repository writer, current-session access and panel scroll reset.
 * @returns Reactive editor state and annotation actions wired into the app's slots and commands.
 */
export function createAnnotationWorkflow(options: {
  context: Context
  state: ThreadRepositoryState
  updateState: UpdateRepository
  activeSessionID: () => string | undefined
  clearPanelFocus: () => void
}) {
  const { context, state, updateState, activeSessionID } = options
  const annotation = createAnnotationState()
  const [replyModeEnabled, setReplyModeEnabled] = createSignal(false)
  const [activeEditor, setActiveEditor] = createSignal<TextareaRenderable | undefined>()
  let disposed = false
  let saveNotification: ReturnType<typeof setTimeout> | undefined

  const quotedText = () => annotation.currentDraft()?.quote
  const parentThreadID = () => annotation.currentDraft()?.parentThreadID
  const initialComment = () => annotation.currentDraft()?.initialComment ?? ""
  const isAnnotating = () => annotation.state().status !== "idle"
  const isSaving = () => annotation.state().status === "saving"
  const canSaveDraft = (draft: AnnotationDraft) => !disposed
    && activeSessionID() === draft.sessionID && annotation.isSavingDraft(draft.id)

  /**
   * Supplies the textarea targeted by the app-scoped Enter binding.
   *
   * @param editor - Newly mounted annotation input.
   * @returns Cleanup that releases this input without clearing a newer editor's reference.
   */
  const registerEditor = (editor: TextareaRenderable) => {
    setActiveEditor(editor)
    return () => { if (activeEditor() === editor) setActiveEditor(undefined) }
  }

  const releaseEditor = () => {
    selection.pause(false)
    releasePanelFocus(context)
  }
  const openEditor = (draft: Omit<AnnotationDraft, "id">) => {
    if (disposed || !annotation.openEditor(draft)) return false
    selection.pause(true)
    if (context.ui.panel.current()?.name !== THREAD_PANEL) options.clearPanelFocus()
    context.ui.panel.open(THREAD_PANEL)
    return true
  }

  /**
   * Discards the open draft and invalidates any save still waiting on history or storage.
   *
   * @returns Nothing; closes the editor and resumes selection capture.
   */
  const cancelAnnotation = () => {
    const wasOpen = isAnnotating()
    annotation.closeEditor()
    if (wasOpen) releaseEditor()
  }

  /**
   * Opens selected text in the right-hand editor without enabling Reply Mode implicitly.
   *
   * @returns A promise resolving after opening the editor or showing a missing-input warning.
   */
  const commentOnSelection = async () => {
    if (isAnnotating() || disposed) return
    const sessionID = activeSessionID()
    if (!sessionID) {
      context.ui.toast.show({ message: "Open a session before adding a reply thread.", variant: "warning" })
      return
    }
    const quote = selection.take(sessionID) ?? readSelection(context.renderer)
    if (!quote) {
      context.ui.toast.show({ message: "Select text from an assistant response first.", variant: "warning" })
      return
    }
    openEditor({ sessionID, quote, initialComment: "" })
  }

  /**
   * Opens an existing pending comment while preserving its identity and quoted context.
   *
   * @param threadID - Pending comment in the active session to edit.
   * @returns Nothing; opens a prefilled draft or ignores an unavailable comment.
   */
  const editPendingThread = (threadID: string) => {
    const sessionID = activeSessionID()
    const thread = sessionID ? pendingThreads(state, sessionID).find((item) => item.id === threadID) : undefined
    if (thread) openEditor({ sessionID: thread.sessionID, quote: thread.quote.raw, initialComment: thread.comment, editingThreadID: thread.id })
  }

  const saveNewComment = async (draft: AnnotationDraft, comment: string) => {
    const history = await readHistory(context, draft.sessionID)
    if (!canSaveDraft(draft)) return undefined
    const session = state.sessions[draft.sessionID]
    const link: ParentLink = draft.parentThreadID ? { parentThreadID: draft.parentThreadID }
      : resolveParent({ quote: draft.quote, batches: session?.batches ?? [], threads: session?.threads ?? [], messages: history })
    const parent = session?.threads.find((thread) => thread.id === link.parentThreadID)
    let saved: { confidence: string; label: string } | undefined
    await updateState((repository) => {
      if (!canSaveDraft(draft)) return
      const result = captureThread(repository, { sessionID: draft.sessionID, rawQuote: draft.quote, comment, messages: toSourceMessages(history), parentThreadID: link.parentThreadID }, {
        id: `rt_${crypto.randomUUID().replaceAll("-", "")}`, now: new Date().toISOString(),
      })
      saved = { confidence: result.attribution.confidence, label: result.thread.label ?? "" }
    })
    if (!saved) return undefined
    const parts = [`Reply thread ${saved.label} saved`]
    if (parent?.label) parts.push(`, following up on ${parent.label}`)
    if (saved.confidence !== "exact") parts.push(` (${saved.confidence} source)`)
    parts.push(".")
    if (link.unpinned) parts.push(" Couldn't tell which comment this answers, so it starts a new thread.")
    return parts.join("")
  }

  const showSaved = (message: string, sessionID: string) => {
    clearTimeout(saveNotification)
    saveNotification = setTimeout(() => {
      if (!disposed && activeSessionID() === sessionID) {
        context.ui.toast.show({ message: enterSends() ? `${message} Press Enter to send.` : message, variant: "success" })
      }
    }, 100)
  }

  /**
   * Saves the current draft once. Failure keeps the same input open for retry; cancelled or
   * superseded work cannot write to another session or close the current editor.
   *
   * @param comment - Text submitted by the annotation input.
   * @returns A promise resolving after save, validation feedback or a handled persistence error.
   */
  const saveComment = async (comment: string) => {
    if (disposed || annotation.state().status !== "editing") return
    const current = annotation.currentDraft()
    if (!current || current.sessionID !== activeSessionID()) { cancelAnnotation(); return }
    if (!comment.trim()) {
      context.ui.toast.show({ message: "Add an annotation before saving.", variant: "warning" })
      return
    }
    const draft = annotation.startSaving()
    if (!draft) return
    try {
      let message: string | undefined
      if (draft.editingThreadID) {
        await updateState((repository) => {
          if (!canSaveDraft(draft)) return
          updatePendingComment(repository, draft.sessionID, draft.editingThreadID!, comment, new Date().toISOString())
          message = "Reply thread updated."
        })
      } else {
        message = await saveNewComment(draft, comment)
      }
      if (!message || !canSaveDraft(draft) || !annotation.finishSaving(draft.id)) return
      releaseEditor()
      showSaved(message, draft.sessionID)
    } catch (error) {
      if (canSaveDraft(draft) && annotation.resumeEditing(draft.id)) {
        context.ui.toast.show({ message: error instanceof Error ? error.message : "Could not save annotation.", variant: "error" })
      }
    }
  }

  /**
   * Registers targeted editor keys from the app slot rather than the panel input scope.
   *
   * @returns Nothing; the host removes the layer when its app-slot owner is disposed.
   */
  const registerEditorKeys = () => context.keymap.layer(() => ({
    mode: "global", priority: 200, target: activeEditor,
    enabled: () => isAnnotating() && activeEditor() !== undefined,
    commands: [
      { bind: "return", run: () => { if (activeEditor()) void saveComment(activeEditor()!.plainText) } },
      { bind: "shift+return", run: () => { activeEditor()?.insertText("\n") } },
    ],
  }))

  const selection = trackCommentSelection(context.renderer, () => replyModeEnabled() ? activeSessionID() : undefined, (sessionID, quote) => {
    openEditor({ sessionID, quote, initialComment: "" })
  })

  /**
   * Opens a new follow-up with the complete answer quoted and its parent explicitly recorded.
   *
   * @param threadID - Comment whose model answer is being annotated.
   * @param quote - Full source answer to preserve through conversation compaction.
   * @returns Nothing; opens the draft and enables Reply Mode when no draft is already open.
   */
  const replyToThread = (threadID: string, quote: string) => {
    const sessionID = activeSessionID()
    if (sessionID && openEditor({ sessionID, quote, parentThreadID: threadID, initialComment: "" })) setReplyModeEnabled(true)
  }

  const toggleReplyMode = () => {
    if (replyModeEnabled()) {
      cancelAnnotation()
      setReplyModeEnabled(false)
      selection.clear()
      context.ui.toast.show({ message: "Reply Mode off.", variant: "info" })
    } else {
      selection.clear()
      setReplyModeEnabled(true)
      context.ui.toast.show({ message: "Reply Mode on. Select response text to annotate.", variant: "info" })
    }
  }
  const handleReplyModeShortcut = async () => {
    if (!activeSessionID()) {
      context.ui.toast.show({ message: "Open a session before entering Reply Mode.", variant: "warning" })
      return
    }
    toggleReplyMode()
  }

  // The host exposes only the focused renderable's text, not the prompt directly.
  const promptHasText = () => {
    const focused = context.renderer.currentFocusedRenderable as { plainText?: unknown } | null | undefined
    return typeof focused?.plainText === "string" && focused.plainText.trim().length > 0
  }
  const enterSends = () => {
    const sessionID = activeSessionID()
    return replyModeEnabled() && !isAnnotating() && sessionID !== undefined
      && pendingThreads(state, sessionID).length > 0 && !promptHasText()
  }
  const resetForSession = () => {
    clearTimeout(saveNotification)
    cancelAnnotation()
    selection.clear()
    setReplyModeEnabled(false)
  }
  const dispose = () => {
    disposed = true
    clearTimeout(saveNotification)
    annotation.closeEditor()
    setActiveEditor(undefined)
    selection.dispose()
  }

  return {
    replyModeEnabled, quotedText, parentThreadID, initialComment, isAnnotating, isSaving,
    commentOnSelection, editPendingThread, cancelAnnotation, saveComment, replyToThread,
    toggleReplyMode, handleReplyModeShortcut, enterSends, registerEditor, registerEditorKeys,
    resetForSession, dispose,
  }
}
