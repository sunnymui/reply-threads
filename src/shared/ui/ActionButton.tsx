import { createSignal } from "solid-js"

/**
 * Renders the shared styled action control used by the annotation editor and thread-review
 * reply/close actions. This primitive owns hover and mouse handling, not feature
 * behavior.
 *
 * @param props - Label and activation callback supplied by any annotation or thread-review
 *   surface.
 * @returns The shared hover-styled button, delegating left-button activation to onPress.
 */
export function ActionButton(props: { label: string; onPress: () => void }) {
  const [hovered, setHovered] = createSignal(false)
  return (
    <box
      height={1}
      flexShrink={0}
      paddingX={1}
      backgroundColor={hovered() ? "#7aa2f7" : "#28344f"}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        props.onPress()
      }}
    >
      <text selectable={false} fg={hovered() ? "#182338" : "#c0d2ff"}>{props.label}</text>
    </box>
  )
}
