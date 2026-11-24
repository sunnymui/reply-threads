import { SidebarRow } from "./SidebarRow.js"
import type { Context } from "@opencode/plugin/tui/context"
import { createMemo, createSignal, Show, untrack } from "solid-js"
import { sessionRunning } from "../../../opencode-helpers/message-history.js"
import { createReviewHistory } from "../../replies/review-history.js"
import type { ThreadRepositoryState } from "../data/thread-types.js"
import { pendingThreads } from "../data/thread-repository.js"
import { buildThreadTree, flattenTree, type NodeReply } from "../review/thread-tree.js"
import { UI_COLORS } from "../../../shared/ui/colors.js"
import { flattenText } from "../../../shared/text/display-text.js"

const MAX_ROWS = 10

/** Terse on purpose: the real sidebar text area is only about 36 columns, and a longer line gets truncated in the middle. The shortcut matches the toolbar hint. */
const HOVER_DESCRIPTION = "Pending replies and sent threads"
const HOVER_SHORTCUT = "Ctrl+L opens or closes this panel"

/**
 * Selects the compact status glyph for a comment’s derived model reply.
 *
 * @param reply - Derived answer or status for one batch or comment.
 * @returns ◈ for an answer, … for a running reply, or · for other states.
 */
const marker = (reply: NodeReply) =>
  reply.kind === "section" || reply.kind === "whole" ? "◈" : reply.kind === "running" ? "…" : "·"

/**
 * Renders the threads feature’s compact conversation tree in OpenCode’s native sidebar. Uses
 * complete review history and the threads tree builder; delegates opening or focusing the
 * full ThreadPanel to the app.
 *
 * With only pending comments it shows the count and Open threads button. Sent rows are capped,
 * and hover guidance reserves space so the host sidebar does not shift.
 *
 * @param props - Native-sidebar session/repository view, host history APIs and app panel-opening
 *   callback.
 * @returns The native-sidebar thread summary, or null when the session has no threads.
 */
export function SidebarEntry(props: {
  context: Context
  sessionID: string
  state: ThreadRepositoryState
  /** Open the panel; `threadID` names the comment to jump to. */
  onOpen: (threadID?: string) => void
}) {
  /**
   * Reads the sidebar session’s thread collection for its compact list and Open threads count.
   *
   * @returns All threads in the current surface’s session, or an empty array.
   */
  const threads = () => props.state.sessions[props.sessionID]?.threads ?? []
  /**
   * Counts pending comments for the native-sidebar section heading without rendering them as sent-
   * history rows.
   *
   * @returns The number of pending comments in the native-sidebar session.
   */
  const pending = () => pendingThreads(props.state, props.sessionID).length
  const history = createReviewHistory({
    context: untrack(() => props.context),
    sessionID: () => props.sessionID,
    batches: () => props.state.sessions[props.sessionID]?.batches ?? [],
  })
  const rows = createMemo(() => flattenTree(buildThreadTree(
    threads().filter((thread) => thread.status !== "pending" && thread.status !== "sending"),
    props.state.sessions[props.sessionID]?.batches ?? [],
    history(),
    sessionRunning(props.context, props.sessionID),
  )))
  const [hovered, setHovered] = createSignal(false)
  return (
    <Show when={threads().length > 0}>
    <box flexDirection="column" flexShrink={0} paddingTop={1}>
      <text selectable={false} fg={UI_COLORS.title}>
        {pending() > 0 ? `Reply Threads · ${pending()} pending` : "Reply Threads"}
      </text>
      {rows().length > 0 ? (
        <box flexDirection="column" flexShrink={0} paddingTop={1}>
          {rows().slice(0, MAX_ROWS).map((row) => (
            <SidebarRow
              depth={row.depth}
              label={row.node.thread.label ?? "·"}
              marker={marker(row.node.reply)}
              text={flattenText(row.node.thread.comment)}
              onPress={() => props.onOpen(row.node.thread.id)}
            />
          ))}
          {rows().length > MAX_ROWS ? <text selectable={false} fg={UI_COLORS.muted}>{`+${rows().length - MAX_ROWS} more`}</text> : null}
        </box>
      ) : null}
      <box flexDirection="row" flexShrink={0} paddingTop={1}>
        <box
          height={1}
          flexShrink={0}
          paddingX={1}
          backgroundColor={hovered() ? UI_COLORS.accent : UI_COLORS.button}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          onMouseUp={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            props.onOpen()
          }}
        >
          <text
            selectable={false}
            onMouseOver={() => setHovered(true)}
            onMouseOut={() => setHovered(false)}
            fg={hovered() ? UI_COLORS.buttonText : UI_COLORS.title}
          >
            {`Open threads (${threads().length})`}
          </text>
        </box>
      </box>
      {/* Two rows are always reserved, so hovering never shifts anything below. */}
      <text height={1} flexShrink={0} selectable={false} wrapMode="none" truncate fg={UI_COLORS.muted}>
        {hovered() ? HOVER_DESCRIPTION : ""}
      </text>
      <text height={1} flexShrink={0} selectable={false} wrapMode="none" truncate fg={UI_COLORS.muted}>
        {hovered() ? HOVER_SHORTCUT : ""}
      </text>
    </box>
    </Show>
  )
}
