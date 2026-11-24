import type { Context, PanelInput } from "@opencode/plugin/tui/context"
import type { ScrollBoxRenderable } from "@opentui/core"
import { createEffect, createSignal } from "solid-js"
import type { ReplyThread } from "../data/thread-types.js"
import type { ThreadRow } from "../review/thread-tree.js"

/**
 * Creates a stable renderable ID shared by sent cards and focused-card scrolling.
 *
 * @param threadID - Comment to locate after the panel lays out its cards.
 * @returns The card's renderable ID.
 */
export const threadRowID = (threadID: string) => `reply-thread-${threadID}`

/**
 * Owns panel keyboard selection, answer expansion and sidebar-to-card scrolling.
 * Call inside ThreadPanel's Solid scope so effects and key bindings follow its lifecycle.
 *
 * @param options - Host panel/APIs and reactive getters for rows, selection input and annotation.
 * @returns Navigation state, scroll ref, close action and shortcut registration.
 */
export function createPanelNavigation(options: {
  context: Context
  panel: PanelInput
  getPendingThreads: () => ReplyThread[]
  getSentRows: () => ThreadRow[]
  getFocusedThreadID: () => string | undefined
  isAnnotating: () => boolean
  onCancelAnnotation: () => void
}) {
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [expandedThreadIDs, setExpandedThreadIDs] = createSignal<ReadonlySet<string>>(new Set())
  let scroll: ScrollBoxRenderable | undefined

  const selectedThread = () => {
    const pending = options.getPendingThreads()
    return pending[Math.min(selectedIndex(), Math.max(0, pending.length - 1))]
  }

  const keepSelectionInBounds = () => {
    setSelectedIndex((index) => Math.max(0, Math.min(index, options.getPendingThreads().length - 1)))
  }

  const toggleExpanded = (threadID: string) => setExpandedThreadIDs((current) => {
    const next = new Set(current)
    if (!next.delete(threadID)) next.add(threadID)
    return next
  })

  createEffect(() => {
    const id = options.getFocusedThreadID()
    if (!id || !options.getSentRows().some((row) => row.node.thread.id === id)) return
    setExpandedThreadIDs((current) => new Set(current).add(id))
    // Wait for expanded-card layout. scrollChildIntoView cannot align a card
    // taller than the viewport, so explicitly put its top at the panel's top.
    setTimeout(() => {
      try {
        const row = scroll?.content.findDescendantById(threadRowID(id))
        if (scroll && row) scroll.scrollTo(Math.max(0, row.y - scroll.content.y))
      } catch { /* row gone */ }
    }, 60)
  })

  // Hide discards an annotation and closes the panel; Escape during annotation
  // only cancels that annotation, leaving the review panel open.
  const closePanel = () => {
    if (options.isAnnotating()) options.onCancelAnnotation()
    options.panel.close()
  }

  /**
   * Connects panel keys to navigation and the separately created pending-comment actions.
   *
   * @param actions - Edit/delete operations for the currently selected pending comment.
   * @returns Nothing; the host owns the layer within the mounted panel scope.
   */
  const registerShortcuts = (actions: { editSelected: () => Promise<void>; deleteSelected: () => Promise<void> }) => {
    options.context.keymap.layer(() => ({
      mode: "global",
      priority: 50,
      commands: [
        { bind: "escape", run: () => { if (options.isAnnotating()) options.onCancelAnnotation(); else options.panel.close() } },
        // Never swallow typing or caret movement in the annotation editor.
        { bind: "up", enabled: () => !options.isAnnotating() && options.getPendingThreads().length > 1, run: () => { setSelectedIndex((index) => Math.max(0, index - 1)) } },
        { bind: "down", enabled: () => !options.isAnnotating() && options.getPendingThreads().length > 1, run: () => { setSelectedIndex((index) => Math.min(options.getPendingThreads().length - 1, index + 1)) } },
        { bind: "e", enabled: () => !options.isAnnotating() && options.getPendingThreads().length > 0, run: actions.editSelected },
        { bind: "d", enabled: () => !options.isAnnotating() && options.getPendingThreads().length > 0, run: actions.deleteSelected },
      ],
    }))
  }

  return {
    selectedIndex,
    selectedThread,
    keepSelectionInBounds,
    expandedThreadIDs,
    toggleExpanded,
    setScrollBox: (value: ScrollBoxRenderable) => { scroll = value },
    closePanel,
    registerShortcuts,
  }
}
