import type { Context } from "@opencode/plugin/tui/context"

/**
 * Reads the renderer’s current selection as a fallback when the selection-complete event was not
 * captured.
 *
 * @param renderer - Host-provided OpenTUI renderer.
 * @returns The unmodified selection when it contains nonwhitespace text, otherwise undefined.
 */
export function readSelection(renderer: Context["renderer"]): string | undefined {
  const value = renderer.getSelection()?.getSelectedText()
  return value?.trim() ? value : undefined
}

/**
 * Owns the selection listener used by Reply Mode, snapshotting text before host key or mouse
 * handling clears it and exposing pause/clear lifecycle controls.
 *
 * @param renderer - Host-provided OpenTUI renderer.
 * @param session - Accessor returning the eligible session ID, or undefined to disable capture.
 * @param onCaptured - Optional callback notifying the annotation workflow of an eligible quote.
 * @returns Session-scoped peek/take accessors, pause/clear controls and listener disposal.
 */
export function trackCommentSelection(
  renderer: Context["renderer"],
  session: () => string | undefined,
  onCaptured?: (sessionID: string, quote: string) => void,
) {
  let owner: string | undefined
  let quote: string | undefined
  let paused = false
  /**
   * Discards the session owner and quote snapshot held by the annotate feature’s selection
   * tracker.
   *
   * @returns Nothing; discards the local session owner and captured selection.
   */
  const clear = () => { owner = undefined; quote = undefined }
  /**
   * Snapshots an eligible completed renderer selection for the annotate workflow and notifies the
   * optional capture callback. The workflow controls pausing; this listener only checks the
   * current pause state.
   *
   * @param selection - Completed renderer selection to snapshot without altering host copy
   *   behavior.
   * @returns Nothing; updates the snapshot and optionally invokes onCaptured.
   */
  const selected = (selection: { getSelectedText(): string }) => {
    if (paused) return
    const sessionID = session()
    if (!sessionID) { clear(); return }
    const text = selection.getSelectedText()
    if (!text.trim()) return
    owner = sessionID
    quote = text
    onCaptured?.(sessionID, text)
    // Esc is swallowed by the host while a transcript selection is highlighted,
    // and a stale highlight blocks re-selecting the same spot. The quote is
    // already captured (and the host's copy ran on this same event), so drop
    // the highlight shortly after, once the host's handlers have finished.
    if (onCaptured) setTimeout(() => { if (!renderer.isDestroyed) renderer.clearSelection() }, 50)
  }
  // EventEmitter's public API; do not intercept or suppress the host's copy action.
  renderer.prependListener("selection", selected)
  return {
    clear,
    peek(sessionID: string): string | undefined {
      return owner === sessionID ? quote : undefined
    },
    take(sessionID: string): string | undefined {
      const text = owner === sessionID ? quote : undefined
      clear()
      return text
    },
    pause(value: boolean) { paused = value; clear() },
    dispose() { renderer.off("selection", selected); clear() },
  }
}
