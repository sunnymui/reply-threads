import { createSignal } from "solid-js"
import { UI_COLORS } from "../../../shared/ui/colors.js"

const MAX_INDENT = 3

/**
 * Renders one private row of the threads feature’s compact sidebar tree. Shows nesting and reply
 * status while delegating row activation to SidebarEntry.
 *
 * @param props - Nesting depth, label, reply-status glyph, one-line comment text and row
 *   activation callback.
 * @returns A single indented, truncated and clickable compact-tree row.
 */
export function SidebarRow(props: { depth: number; label: string; marker: string; text: string; onPress: () => void }) {
  const [hovered, setHovered] = createSignal(false)
  return (
    <box
      height={1}
      flexShrink={0}
      paddingLeft={Math.min(props.depth, MAX_INDENT) * 2}
      backgroundColor={hovered() ? UI_COLORS.accent : undefined}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        props.onPress()
      }}
    >
      <text selectable={false} wrapMode="none" truncate fg={hovered() ? UI_COLORS.buttonText : UI_COLORS.row}>
        {`${props.marker} ${props.label} ${props.text}`}
      </text>
    </box>
  )
}
