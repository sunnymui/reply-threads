import type { NodeReply } from "../threads/review/thread-tree.js"
import { EDITOR_COLORS } from "../../shared/ui/colors.js"
import { flattenText } from "../../shared/text/display-text.js"
import { ActionButton } from "../../shared/ui/ActionButton.js"

const COLLAPSED_LIMIT = 240

/**
 * Removes display-only Markdown from model text before showing it in a reply card.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @returns Display text with selected Markdown delimiters removed; source reply text stays
 *   intact.
 */
const plainReply = (value: string) =>
  value.replace(/^[ \t]*(?:```|~~~).*$/gm, "").replace(/^#{1,6}[ \t]+/gm, "").replace(/\*\*|__|`/g, "").replace(/\n{3,}/g, "\n\n").trim()

/**
 * Converts derived reply state into the short status shown when no answer text can be displayed.
 *
 * @param reply - Derived answer or status for one batch or comment.
 * @returns A status message for a reply without text, or undefined for a text-bearing answer.
 */
function replyNote(reply: NodeReply): string | undefined {
  switch (reply.kind) {
    case "running": return "◈ Model is replying…"
    case "empty": return "◈ No reply from the model"
    case "missing": return "◈ Reply is not in the loaded history"
    case "legacy": return "◈ Sent before replies were tracked"
    case "unanswered": return "◈ No separate answer for this comment"
    case "shared": return "◈ Answered together with the first comment of this batch"
    case "section":
    case "whole": return undefined
  }
}

/**
 * Renders one model answer, its collapse/expand affordance and the Reply action for follow-ups.
 *
 * @param props - Derived answer state from the thread tree, expansion state and toggle/optional
 *   Reply actions.
 * @returns A model-answer or status block, with expansion and Reply controls when applicable.
 */
export function ReplyBlock(props: { reply: NodeReply; expanded: boolean; onToggle: () => void; onReply?: () => void }) {
  /**
   * Gets displayable text from a derived model-reply state.
   *
   * @returns The model-answer display text, or undefined for a status-only reply.
   */
  const text = () => (props.reply.kind === "section" || props.reply.kind === "whole" ? plainReply(props.reply.text) : undefined)
  /**
   * Determines whether a model reply needs collapse/expand treatment.
   *
   * @returns True when the compact answer exceeds the collapsed-preview limit.
   */
  const long = () => flattenText(text() ?? "").length > COLLAPSED_LIMIT
  /**
   * Builds the label shown above one model-reply block.
   *
   * @returns The model-answer block heading.
   */
  const heading = () => props.reply.kind === "whole" ? `◈ Model reply (to all ${props.reply.comments} comments)` : "◈ Model reply"
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border={["left"]}
      borderStyle="heavy"
      borderColor={EDITOR_COLORS.divider}
      paddingX={1}
      onMouseUp={(event) => { if (event.button === 0 && long()) { event.stopPropagation(); props.onToggle() } }}
    >
      {text() === undefined ? (
        <text selectable={false} fg={EDITOR_COLORS.muted}>{replyNote(props.reply)}</text>
      ) : (
        <>
          <text selectable={false} fg={EDITOR_COLORS.label}>{heading()}</text>
          <text wrapMode="word">{props.expanded || !long() ? text() : `${flattenText(text()!).slice(0, COLLAPSED_LIMIT - 1)}…`}</text>
          {long() ? <text selectable={false} fg={EDITOR_COLORS.muted}>{props.expanded ? "click to collapse" : "click to read all"}</text> : null}
          {props.onReply ? (
            <box flexDirection="row" flexShrink={0} paddingTop={1}>
              <ActionButton label="Reply" onPress={props.onReply} />
            </box>
          ) : null}
        </>
      )}
    </box>
  )
}
