import { EDITOR_COLORS } from "./colors.js"
import { clipText } from "../text/display-text.js"

const QUOTE_LIMIT = 320

/**
 * Creates a compact display-only quote while leaving the stored selection untouched.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @param limit - Maximum displayed length including the ellipsis.
 * @returns The compact quote preview using the supplied limit or the default quote limit.
 */
export const clipQuote = (value: string, limit = QUOTE_LIMIT) => {
  return clipText(value, limit)
}

/**
 * Renders a reusable quote preview for annotation editors and thread cards using shared UI
 * colors and display-text clipping. Display shortening never changes the full quote stored or
 * sent.
 *
 * @param props - Full quote text and optional display-only clipping limit.
 * @returns The accent-bordered quote preview; stored quote text is not mutated.
 */
export function QuoteBlock(props: { text: string; limit?: number }) {
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border={["left"]}
      borderStyle="heavy"
      borderColor={EDITOR_COLORS.accent}
      backgroundColor={EDITOR_COLORS.quoteBackground}
      paddingX={1}
    >
      <text selectable={false} wrapMode="word" fg={EDITOR_COLORS.quoteText}>
        <em>{clipQuote(props.text, props.limit)}</em>
      </text>
    </box>
  )
}
