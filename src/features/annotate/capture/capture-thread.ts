import { attributeQuote } from "./quote-attribution.js"
import { nextLabel } from "../../threads/data/thread-labels.js"
import { addThread, createThread } from "../../threads/data/thread-repository.js"
import type { AttributionResult, ReplyThread, ThreadRepositoryState } from "../../threads/data/thread-types.js"

export interface CaptureInput {
  sessionID: string
  rawQuote: string
  comment: string
  messages: Parameters<typeof attributeQuote>[1]
  /** The earlier comment this one follows up on, when the quote came from its reply. */
  parentThreadID?: string
}

/**
 * Implements the annotate feature’s pure save operation: attribute the quote, allocate a label
 * through the threads feature, and insert the new thread into the supplied repository draft.
 * Both annotation entry paths call this through ../annotation-workflow.tsx; the caller owns
 * persistence.
 *
 * @param state - Mutable threads repository draft; call inside updateState to persist
 *   atomically.
 * @param input - Session, raw quote, comment, attribution messages and optional explicit parent.
 * @param options - Caller-generated thread ID and creation timestamp.
 * @returns The attribution result and newly inserted, labeled thread; persistence remains the
 *   caller’s responsibility.
 */
export function captureThread(
  state: ThreadRepositoryState,
  input: CaptureInput,
  options: { id: string; now: string },
): { attribution: AttributionResult; thread: ReplyThread } {
  const attribution = attributeQuote(input.rawQuote, input.messages)
  const existing = state.sessions[input.sessionID]?.threads ?? []
  const parent = input.parentThreadID ? existing.find((thread) => thread.id === input.parentThreadID) : undefined
  // Assigned inside the same storage update as the add, so two TUI instances
  // cannot hand out the same label.
  const label = nextLabel(existing, parent)
  const { messages: _messages, ...thread } = input
  const created = createThread({ ...thread, ...(parent ? { parentThreadID: parent.id } : {}), label, attribution, ...options })
  addThread(state, created)
  return { attribution, thread: created }
}
