import type { ThreadRow } from "../review/thread-tree.js"
import { EDITOR_COLORS } from "../../../shared/ui/colors.js"
import { QuoteBlock } from "../../../shared/ui/QuoteBlock.js"
import { ReplyBlock } from "../../replies/ReplyBlock.js"

/**
 * Displays a sent comment at its conversation depth, with its derived model answer.
 *
 * @param props - Review row, heading, scroll target ID, display state and answer actions.
 * @returns An indented card whose Reply action preserves the full answer and parent ID.
 */
export function SentThreadCard(props: {
  row: ThreadRow
  heading: string
  rowID: string
  focused: boolean
  expanded: boolean
  onToggle: () => void
  onReplyTo?: (threadID: string, quote: string) => void
}) {
  // Status-only answers have no Reply action. Keep the source answer intact even
  // when ReplyBlock clips or strips Markdown for display.
  const replyAction = () => {
    const reply = props.row.node.reply
    const onReplyTo = props.onReplyTo
    const threadID = props.row.node.thread.id
    return onReplyTo && (reply.kind === "section" || reply.kind === "whole")
      ? () => onReplyTo(threadID, reply.text)
      : undefined
  }

  return (
    <box id={props.rowID} flexDirection="column" flexShrink={0} paddingLeft={props.row.depth * 2}>
      <box flexDirection="column" border borderStyle="rounded" borderColor={props.focused ? EDITOR_COLORS.accent : undefined} padding={1}>
        <text fg={EDITOR_COLORS.label}>{props.heading}</text>
        <QuoteBlock text={props.row.node.thread.quote.raw} limit={140} />
        <text>{props.row.node.thread.comment}</text>
        <ReplyBlock
          reply={props.row.node.reply}
          expanded={props.expanded}
          onToggle={props.onToggle}
          onReply={replyAction()}
        />
      </box>
    </box>
  )
}
