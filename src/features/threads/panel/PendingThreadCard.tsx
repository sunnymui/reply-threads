import type { ReplyThread } from "../data/thread-types.js"
import { EDITOR_COLORS } from "../../../shared/ui/colors.js"
import { QuoteBlock } from "../../../shared/ui/QuoteBlock.js"
import { ActionButton } from "../../../shared/ui/ActionButton.js"

/**
 * Displays one pending or sending comment without owning keyboard or storage behavior.
 *
 * @param props - Thread, heading, keyboard-selection state and optional discard action.
 * @returns The comment card with its quote, text and optional sending/selection marker.
 */
export function PendingThreadCard(props: { thread: ReplyThread; heading: string; selected: boolean; onDiscard?: () => void }) {
  return (
    <box flexDirection="column" border borderStyle="rounded" padding={1}>
      <text fg={EDITOR_COLORS.label}>
        {[
          props.heading,
          props.thread.status === "sending" ? "SENDING" : undefined,
          props.selected ? "▶ selected" : undefined,
        ].filter(Boolean).join(" · ")}
      </text>
      <QuoteBlock text={props.thread.quote.raw} limit={140} />
      <text>{props.thread.comment}</text>
      {props.thread.status === "pending" && props.onDiscard ? (
        <box flexDirection="row" flexShrink={0} paddingTop={1}>
          <ActionButton label="Discard" onPress={props.onDiscard} />
        </box>
      ) : null}
    </box>
  )
}
