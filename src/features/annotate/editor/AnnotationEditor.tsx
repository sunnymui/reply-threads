import type { Context } from "@opencode/plugin/tui/context"
import type { TextareaRenderable } from "@opentui/core"
import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { QuoteBlock } from "../../../shared/ui/QuoteBlock.js"
import { Divider } from "../../../shared/ui/Divider.js"
import { EDITOR_COLORS } from "../../../shared/ui/colors.js"
import { ActionButton } from "../../../shared/ui/ActionButton.js"
import { handleAnnotationKey } from "./annotation-keys.js"

/**
 * Owns the annotate feature’s editor embedded by ThreadPanel, including input state, focus
 * restoration. Exposes the mounted textarea to the annotation workflow so its app-scoped
 * key layer can target the current input across repeated captures.
 *
 * @param props - Host context, preserved quote, optional parent label and annotation save/cancel
 *   callbacks.
 * @returns The quoted-context editor and its save/cancel controls.
 */
export function AnnotationEditor(props: {
  context: Context
  quote: string
  initialComment?: string
  parentLabel?: string
  onSaveCapture?: (comment: string) => Promise<void>
  onCancelCapture?: () => void
  isSaving?: boolean
  onEditorReady?: (editor: TextareaRenderable) => () => void
}) {
  const [captureComment, setCaptureComment] = createSignal(props.initialComment ?? "")
  let captureEditor: TextareaRenderable | undefined
  let focusTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(focusTimer))
  onMount(() => {
    captureEditor?.gotoBufferEnd()
    if (captureEditor) {
      const releaseEditor = props.onEditorReady?.(captureEditor)
      if (releaseEditor) onCleanup(releaseEditor)
    }
  })
  // Typing and Esc are handled by the editor itself, so the panel never needs
  // to claim host input focus. Claiming it made the host spend the next
  // mouse-down on the transcript handing focus back, dropping that selection
  // (reproduced in a real TUI). If the user clicks inside the panel, the host
  // claims focus on mouse-down and blurs the editor, so re-focus after it.
  /**
   * Restores textarea focus after the host panel claims focus on a mouse-down.
   *
   * @returns Nothing; schedules textarea focus restoration after host mouse handling.
   */
  const focusEditor = () => {
    clearTimeout(focusTimer)
    focusTimer = setTimeout(() => { if (!captureEditor?.isDestroyed) captureEditor?.focus() }, 60)
  }

  createEffect(() => {
    if (!props.quote) return
    setCaptureComment(props.initialComment ?? "")
    focusEditor()
  })

  return (
    <box flexDirection="column" flexShrink={0} border borderStyle="rounded" paddingX={1} paddingY={1} gap={1} onMouseUp={focusEditor}>
      <text selectable={false} fg={EDITOR_COLORS.label}>
        {props.parentLabel ? `Replying to ${props.parentLabel}: the whole reply is quoted` : "Reply to this part of the response"}
      </text>
      <QuoteBlock text={props.quote} />
      <Divider />
      <text selectable={false} fg={EDITOR_COLORS.label}>Your reply</text>
      <textarea
        ref={(value) => { captureEditor = value }}
        initialValue={props.initialComment ?? ""}
        placeholder="What should the assistant change, explain, or reconsider?"
        placeholderColor={EDITOR_COLORS.placeholder}
        backgroundColor={EDITOR_COLORS.inputBackground}
        focusedBackgroundColor={EDITOR_COLORS.inputFocusedBackground}
        textColor={EDITOR_COLORS.inputText}
        focusedTextColor={EDITOR_COLORS.inputText}
        height={5}
        flexShrink={0}
        wrapMode="word"
        focused
        onKeyDown={(event) => handleAnnotationKey(event, captureEditor, {
          save: (text) => { void props.onSaveCapture?.(text) },
          cancel: () => props.onCancelCapture?.(),
        })}
        onContentChange={() => setCaptureComment(captureEditor?.plainText ?? "")}
      />
      <box flexDirection="row" flexShrink={0} gap={1}>
        <ActionButton label={props.isSaving ? "Saving…" : "Save reply"} onPress={() => { if (!props.isSaving) void props.onSaveCapture?.(captureComment()) }} />
        <ActionButton label="Cancel" onPress={() => props.onCancelCapture?.()} />
      </box>
      <text selectable={false} fg={EDITOR_COLORS.muted}>Enter saves · Ctrl+J new line · Esc cancels</text>
    </box>
  )
}
