import { createSignal } from "solid-js"

export interface AnnotationDraft {
  id: string
  sessionID: string
  quote: string
  initialComment: string
  parentThreadID?: string
  editingThreadID?: string
}

export type AnnotationState =
  | { status: "idle" }
  | { status: "editing"; draft: AnnotationDraft }
  | { status: "saving"; draft: AnnotationDraft }

/**
 * Owns the annotation's three states and ignores completion from cancelled or replaced drafts.
 * Reply Mode and textarea focus are separate from this draft lifecycle.
 *
 * @returns Current state/draft accessors and named open, save, retry and close transitions.
 */
export function createAnnotationState() {
  const [state, setState] = createSignal<AnnotationState>({ status: "idle" })
  const currentDraft = () => {
    const current = state()
    return current.status === "idle" ? undefined : current.draft
  }
  const openEditor = (draft: Omit<AnnotationDraft, "id">) => {
    if (state().status !== "idle") return false
    setState({ status: "editing", draft: { ...draft, id: crypto.randomUUID() } })
    return true
  }
  const startSaving = () => {
    const current = state()
    if (current.status !== "editing") return undefined
    setState({ status: "saving", draft: current.draft })
    return current.draft
  }
  const isSavingDraft = (draftID: string) => {
    const current = state()
    return current.status === "saving" && current.draft.id === draftID
  }
  const finishSaving = (draftID: string) => {
    if (!isSavingDraft(draftID)) return false
    setState({ status: "idle" })
    return true
  }
  const resumeEditing = (draftID: string) => {
    const current = state()
    if (current.status !== "saving" || current.draft.id !== draftID) return false
    setState({ status: "editing", draft: current.draft })
    return true
  }
  const closeEditor = () => { setState({ status: "idle" }) }

  return { state, currentDraft, openEditor, startSaving, isSavingDraft, finishSaving, resumeEditing, closeEditor }
}
