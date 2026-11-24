import { createSignal } from "solid-js"

/**
 * Renders a button private to the composer toolbar, including light/dark, active and hover
 * presentation. It delegates activation to the supplied feature action.
 *
 * @param props - Label, active/light presentation and activation/hover callbacks for a composer
 *   action.
 * @returns The composer-specific button and its hover-aware label.
 */
export function ToolbarButton(props: { label: string; active?: boolean; light?: boolean; onPress: () => void; onHover?: (hovered: boolean) => void }) {
  const [hovered, setHovered] = createSignal(false)
  /**
   * Updates the button hover state and forwards it to the parent toolbar.
   *
   * @param value - Whether the pointer is over the toolbar action.
   * @returns Nothing; updates hover state and notifies the toolbar callback.
   */
  const hover = (value: boolean) => { setHovered(value); props.onHover?.(value) }
  return (
    <box
      height={1}
      flexShrink={0}
      paddingX={1}
      backgroundColor={props.active || hovered() ? "#7aa2f7" : props.light ? "#d5deef" : "#28344f"}
      onMouseOver={() => hover(true)}
      onMouseOut={() => hover(false)}
      onMouseUp={(event) => {
        if (event.button !== 0) return
        event.stopPropagation()
        props.onPress()
      }}
    >
      <text selectable={false} onMouseOver={() => hover(true)} onMouseOut={() => hover(false)} fg={props.active || hovered() || props.light ? "#182338" : "#c0d2ff"}>
        {props.label}
      </text>
    </box>
  )
}
