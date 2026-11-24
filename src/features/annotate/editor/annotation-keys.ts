import type { KeyEvent } from "@opentui/core"

type EditorLike = { plainText: string; insertText(text: string): void } | undefined

/**
 * Translates right-hand editor key events into save, newline and cancel actions.
 *
 * @param event - Textarea key event to interpret.
 * @param editor - Annotation textarea access, or undefined before its ref is set.
 * @param actions - Save and cancel callbacks supplied by the annotation editor.
 * @returns Nothing; handles the event or leaves an unrelated key untouched.
 */
export function handleAnnotationKey(
  event: KeyEvent,
  editor: EditorLike,
  actions: { save: (text: string) => void; cancel: () => void },
) {
  if (event.name === "escape") {
    event.preventDefault()
    event.stopPropagation()
    actions.cancel()
    return
  }
  if (event.name === "linefeed") {
    event.preventDefault()
    editor?.insertText("\n")
    return
  }
  if (event.name !== "return" && event.name !== "kpenter") return
  event.preventDefault()
  if (event.shift || event.ctrl || event.meta || event.option || event.super) {
    editor?.insertText("\n")
    return
  }
  actions.save(editor?.plainText ?? "")
}
