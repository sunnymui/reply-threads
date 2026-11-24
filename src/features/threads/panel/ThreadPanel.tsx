import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import { createMemo, untrack } from "solid-js"
import type { TextareaRenderable } from "@opentui/core"
import type { ReplyThread, ThreadRepositoryState } from "../data/thread-types.js"
import type { UpdateRepository } from "../data/workflow-types.js"
import { buildThreadTree, flattenTree } from "../review/thread-tree.js"
import { sessionRunning } from "../../../opencode-helpers/message-history.js"
import { createReviewHistory } from "../../replies/review-history.js"
import { AnnotationEditor } from "../../annotate/editor/AnnotationEditor.js"
import { EDITOR_COLORS } from "../../../shared/ui/colors.js"
import { ActionButton } from "../../../shared/ui/ActionButton.js"
import { PendingThreadCard } from "./PendingThreadCard.js"
import { SentThreadCard } from "./SentThreadCard.js"
import { createPendingThreadActions } from "./pending-thread-actions.js"
import { createPanelNavigation, threadRowID } from "./panel-navigation.js"

/**
 * Composes the panel header, annotation editor, pending cards and sent conversations.
 * Navigation owns selection/scrolling; pending actions delegate editing and handle deletion.
 *
 * @param props - Host panel, repository and annotation/focus callbacks supplied by the app.
 * @returns The unified thread-review layout.
 */
export function ThreadPanel(props: {
  context: Context
  panel: PanelInput
  state: ThreadRepositoryState
  updateState: UpdateRepository
  captureQuote?: string
  captureInitialComment?: string
  onSaveCapture?: (comment: string) => Promise<void>
  onCancelCapture?: () => void
  isSaving?: boolean
  onEditorReady?: (editor: TextareaRenderable) => () => void
  onEditPending?: (threadID: string) => void
  /** Explicit parent from a Reply button, rather than an inferred selection parent. */
  captureParentID?: string
  /** Starts a follow-up with the complete source answer quoted. */
  onReplyTo?: (threadID: string, quote: string) => void
  /** Comment to highlight, expand and scroll to after opening from the sidebar. */
  focusThreadID?: string
}) {
  // Host handles are stable for this mounted panel. Session data and editor
  // state are still read through reactive getters below.
  const context = untrack(() => props.context)
  const panel = untrack(() => props.panel)
  const threads = () => props.state.sessions[props.panel.sessionID]?.threads ?? []
  const pending = () => threads().filter((thread) => thread.status === "pending")
  const sending = () => threads().filter((thread) => thread.status === "sending")
  const sent = () => threads().filter((thread) => thread.status === "sent" || thread.status === "resolved")
  const activeThreads = () => [...pending(), ...sending()]
  const isAnnotating = () => props.captureQuote !== undefined
  const labelOf = (id?: string) => threads().find((thread) => thread.id === id)?.label

  // Keep this formatting local: both card types use the same comment heading.
  const heading = (thread: ReplyThread) => {
    const parentLabel = thread.parentThreadID ? labelOf(thread.parentThreadID) : undefined
    return [thread.label, parentLabel ? `follows up on ${parentLabel}` : undefined, thread.sentAt ? new Date(thread.sentAt).toLocaleString() : undefined]
      .filter(Boolean).join(" · ")
  }

  // Answers are derived from live host history, rather than stored on the threads.
  const history = createReviewHistory({
    context,
    sessionID: () => props.panel.sessionID,
    batches: () => props.state.sessions[props.panel.sessionID]?.batches ?? [],
  })
  const sentRows = createMemo(() => flattenTree(buildThreadTree(
    threads().filter((thread) => thread.status !== "pending" && thread.status !== "sending"),
    props.state.sessions[props.panel.sessionID]?.batches ?? [],
    history(),
    sessionRunning(props.context, props.panel.sessionID),
  )))

  const navigation = createPanelNavigation({
    context,
    panel,
    getPendingThreads: pending,
    getSentRows: sentRows,
    getFocusedThreadID: () => props.focusThreadID,
    isAnnotating,
    onCancelAnnotation: () => props.onCancelCapture?.(),
  })
  const pendingActions = createPendingThreadActions({
    context,
    updateState: (mutation) => props.updateState(mutation),
    getSessionID: () => props.panel.sessionID,
    getSelectedThread: navigation.selectedThread,
    onEditThread: (threadID) => props.onEditPending?.(threadID),
    onDeleted: navigation.keepSelectionInBounds,
  })
  navigation.registerShortcuts(pendingActions)

  return (
    <box flexDirection="column" padding={1} gap={1} height="100%">
      <box flexDirection="row" flexShrink={0} justifyContent="space-between" alignItems="center" gap={1}>
        <text flexShrink={1}>{["Reply Threads", activeThreads().length > 0 ? `${activeThreads().length} pending` : undefined, sent().length > 0 ? `${sent().length} sent` : undefined].filter(Boolean).join(" · ")}</text>
        <ActionButton label="Hide threads" onPress={navigation.closePanel} />
      </box>
      {props.captureQuote ? (
        <AnnotationEditor
          context={props.context}
          quote={props.captureQuote}
          initialComment={props.captureInitialComment}
          parentLabel={props.captureParentID ? labelOf(props.captureParentID) ?? "an earlier comment" : undefined}
          onSaveCapture={props.onSaveCapture}
          onCancelCapture={props.onCancelCapture}
          isSaving={props.isSaving}
          onEditorReady={props.onEditorReady}
        />
      ) : null}
      {activeThreads().length === 0 && sentRows().length === 0 && !isAnnotating() ? (
        <text>No threads yet. Select response text in Reply Mode to add one.</text>
      ) : (
        <scrollbox ref={navigation.setScrollBox} flexGrow={1} stickyStart="top">
          {activeThreads().length > 0 && sentRows().length > 0 ? <text selectable={false} fg={EDITOR_COLORS.muted}>{`Pending · ${activeThreads().length}`}</text> : null}
          {activeThreads().map((thread) => (
            <PendingThreadCard
              thread={thread}
              heading={heading(thread)}
              selected={thread.status === "pending" && pending().length > 1 && pending()[navigation.selectedIndex()]?.id === thread.id}
              onDiscard={() => { void pendingActions.discardThread(thread) }}
            />
          ))}
          {activeThreads().length > 0 && sentRows().length > 0 ? <text selectable={false} fg={EDITOR_COLORS.muted}>{`Sent · ${sentRows().length}`}</text> : null}
          {sentRows().map((row) => (
            <SentThreadCard
              row={row}
              heading={heading(row.node.thread)}
              rowID={threadRowID(row.node.thread.id)}
              focused={props.focusThreadID === row.node.thread.id}
              expanded={navigation.expandedThreadIDs().has(row.node.thread.id)}
              onToggle={() => navigation.toggleExpanded(row.node.thread.id)}
              onReplyTo={!isAnnotating() ? props.onReplyTo : undefined}
            />
          ))}
        </scrollbox>
      )}
      <text>{isAnnotating() ? "" : "↑/↓ select · E edit · D delete · Esc close"}</text>
    </box>
  )
}
