import { nextLabel } from "./thread-labels.js"
import type { AttributionResult, ReplyBatch, ReplyThread, SessionThreadState, ThreadRepositoryState } from "./thread-types.js"

/**
 * Returns or lazily creates the per-session repository bucket used by every state transition.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns The session’s existing repository bucket, or a newly initialized bucket.
 */
function sessionState(state: ThreadRepositoryState, sessionID: string): SessionThreadState {
  return (state.sessions[sessionID] ??= { threads: [], batches: [] })
}

/**
 * Advances the repository revision after a successful mutation.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @returns Nothing; increments the repository revision in place.
 */
function changed(state: ThreadRepositoryState): void {
  state.revision = Number.isFinite(state.revision) ? state.revision + 1 : 1
}

/**
 * Validates and constructs a pending annotation, preserving raw text and attribution metadata.
 *
 * @param input - Thread identity, raw quote/comment, attribution, labels and creation timestamp.
 * @returns A validated pending thread record; does not add it to repository state.
 */
export function createThread(input: {
  id: string
  sessionID: string
  rawQuote: string
  comment: string
  attribution: AttributionResult
  label?: string
  parentThreadID?: string
  now: string
}): ReplyThread {
  if (!input.rawQuote.trim()) throw new Error("A reply thread requires a selected quote")
  if (!input.comment.trim()) throw new Error("A reply thread requires a comment")
  return {
    id: input.id,
    sessionID: input.sessionID,
    ...(input.label && { label: input.label }),
    ...(input.parentThreadID && { parentThreadID: input.parentThreadID }),
    ...(input.attribution.confidence === "exact" && {
      messageID: input.attribution.messageID,
      contentIndex: input.attribution.contentIndex,
    }),
    quote: { raw: input.rawQuote, normalized: input.attribution.normalized },
    comment: input.comment,
    anchor: {
      confidence: input.attribution.confidence,
      ...(input.attribution.confidence === "exact" && {
        start: input.attribution.start,
        end: input.attribution.end,
      }),
    },
    status: "pending",
    createdAt: input.now,
    updatedAt: input.now,
  }
}

/**
 * Adds a uniquely identified thread to its session and advances repository revision.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param thread - Thread record from the session repository.
 * @returns Nothing; inserts the thread into the draft and increments revision.
 */
export function addThread(state: ThreadRepositoryState, thread: ReplyThread): void {
  const duplicate = Object.values(state.sessions).some((session) => session.threads.some((item) => item.id === thread.id))
  if (duplicate) throw new Error(`Duplicate reply thread ID: ${thread.id}`)
  sessionState(state, thread.sessionID).threads.push(thread)
  changed(state)
}

/**
 * Updates only the comment text of a pending thread.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @param threadID - Comment identifier used for lookup or focus.
 * @param comment - User-authored comment to save.
 * @param now - Timestamp applied to the repository transition.
 * @returns Nothing; updates comment text and timestamp and increments revision.
 */
export function updatePendingComment(
  state: ThreadRepositoryState,
  sessionID: string,
  threadID: string,
  comment: string,
  now: string,
): void {
  if (!comment.trim()) throw new Error("A reply thread requires a comment")
  const thread = sessionState(state, sessionID).threads.find((item) => item.id === threadID)
  if (!thread) throw new Error(`Unknown reply thread: ${threadID}`)
  if (thread.status !== "pending") throw new Error("Only pending reply threads can be edited")
  thread.comment = comment
  thread.updatedAt = now
  changed(state)
}

/**
 * Removes one pending thread without affecting sent history.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @param threadID - Comment identifier used for lookup or focus.
 * @returns Nothing; removes the pending thread and increments revision.
 */
export function removePendingThread(state: ThreadRepositoryState, sessionID: string, threadID: string): void {
  const session = sessionState(state, sessionID)
  const index = session.threads.findIndex((item) => item.id === threadID)
  if (index < 0) throw new Error(`Unknown reply thread: ${threadID}`)
  if (session.threads[index].status !== "pending") throw new Error("Only pending reply threads can be removed")
  session.threads.splice(index, 1)
  changed(state)
}

/**
 * Returns pending threads in creation order for the send workflow.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns Pending threads for the requested session in repository order.
 */
export function pendingThreads(state: ThreadRepositoryState, sessionID: string): readonly ReplyThread[] {
  return (state.sessions[sessionID]?.threads ?? []).filter((thread) => thread.status === "pending")
}

/**
 * Deletes all pending threads for a session and returns the number removed.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns The number of pending threads removed from the draft.
 */
export function clearPendingThreads(state: ThreadRepositoryState, sessionID: string): number {
  const session = sessionState(state, sessionID)
  const before = session.threads.length
  session.threads = session.threads.filter((thread) => thread.status !== "pending")
  const removed = before - session.threads.length
  if (removed > 0) changed(state)
  return removed
}

/**
 * Validates submission ownership, records a batch and locks its pending threads in one
 * repository draft. The send feature calls this inside updateState before admission; this
 * function itself does not persist or start a transaction.
 *
 * @param state - Mutable repository draft from the caller’s storage update.
 * @param batch - New submitting record with the exact pending thread IDs to lock.
 * @returns Nothing; records the submitting batch, locks its threads and increments revision.
 */
export function beginBatch(state: ThreadRepositoryState, batch: ReplyBatch): void {
  const session = sessionState(state, batch.sessionID)
  if (session.batches.some((item) => item.id === batch.id || item.promptMessageID === batch.promptMessageID)) {
    throw new Error("A reply-thread batch with this identity already exists")
  }
  if (session.batches.some((item) => item.status === "submitting" || item.status === "unknown")) {
    throw new Error("A reply-thread batch is already in flight")
  }
  const selected = batch.threadIDs.map((id) => session.threads.find((thread) => thread.id === id))
  if (selected.some((thread) => !thread)) throw new Error("A reply-thread batch contains an unknown thread")
  if (selected.some((thread) => thread?.status !== "pending")) throw new Error("Only pending reply threads can be sent")
  session.batches.push(batch)
  for (const thread of selected as ReplyThread[]) {
    thread.status = "sending"
    thread.batchID = batch.id
    thread.updatedAt = batch.updatedAt
  }
  changed(state)
}

/**
 * Marks a batch and its threads sent after OpenCode admits the prompt.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @param batchID - Stable batch identifier stored before submission.
 * @param admittedMessageID - User-prompt ID returned by OpenCode admission or found during
 *   reconciliation.
 * @param now - Timestamp applied to the repository transition.
 * @returns Nothing; updates batch/thread sent state, admission ID and timestamps in the draft.
 */
export function markBatchSent(
  state: ThreadRepositoryState,
  sessionID: string,
  batchID: string,
  admittedMessageID: string,
  now: string,
): void {
  const session = sessionState(state, sessionID)
  const batch = session.batches.find((item) => item.id === batchID)
  if (!batch) throw new Error(`Unknown reply-thread batch: ${batchID}`)
  batch.status = "sent"
  batch.admittedMessageID = admittedMessageID
  batch.sentAt = now
  batch.updatedAt = now
  for (const thread of session.threads.filter((item) => item.batchID === batchID)) {
    thread.status = "sent"
    thread.sentAt = now
    thread.updatedAt = now
  }
  changed(state)
}

/**
 * Marks a rejected or proven-absent batch failed and restores its threads to pending in the same
 * draft. Failed batch records remain available as history.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @param batchID - Stable batch identifier stored before submission.
 * @param now - Timestamp applied to the repository transition.
 * @returns Nothing; marks the batch failed and restores its threads to pending in the draft.
 */
export function markBatchFailed(state: ThreadRepositoryState, sessionID: string, batchID: string, now: string): void {
  const session = sessionState(state, sessionID)
  const batch = session.batches.find((item) => item.id === batchID)
  if (!batch) throw new Error(`Unknown reply-thread batch: ${batchID}`)
  batch.status = "failed"
  batch.updatedAt = now
  for (const thread of session.threads.filter((item) => item.batchID === batchID)) {
    thread.status = "pending"
    delete thread.batchID
    thread.updatedAt = now
  }
  changed(state)
}

/**
 * Records indeterminate admission while leaving threads locked in sending state for the send
 * feature’s reconciliation workflow.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @param batchID - Stable batch identifier stored before submission.
 * @param now - Timestamp applied to the repository transition.
 * @returns Nothing; marks the batch unknown while preserving its threads’ sending state.
 */
export function markBatchUnknown(state: ThreadRepositoryState, sessionID: string, batchID: string, now: string): void {
  const batch = sessionState(state, sessionID).batches.find((item) => item.id === batchID)
  if (!batch) throw new Error(`Unknown reply-thread batch: ${batchID}`)
  batch.status = "unknown"
  batch.updatedAt = now
  changed(state)
}

/**
 * Finds submitting or unknown batches that need reconciliation.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Optional session filter; omit to inspect every repository session.
 * @returns Submitting and unknown batches from the requested session, or all sessions if
 *   omitted.
 */
export function recoverableBatches(state: ThreadRepositoryState, sessionID?: string): readonly ReplyBatch[] {
  const sessions = sessionID ? [state.sessions[sessionID]].filter(Boolean) : Object.values(state.sessions)
  return sessions.flatMap((session) => session.batches.filter((batch) => batch.status === "submitting" || batch.status === "unknown"))
}

/**
 * Migrates unlabeled pending legacy threads into the current session label scheme before
 * sending.
 *
 * Only pending legacy threads receive labels; previously sent history is left unchanged.
 *
 * @param state - Threads repository draft or view supplied by the owning workflow.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns Nothing; assigns missing pending-thread labels and advances revision only when
 *   needed.
 */
export function assignMissingLabels(state: ThreadRepositoryState, sessionID: string): void {
  const session = state.sessions[sessionID]
  if (!session) return
  let any = false
  for (const thread of session.threads) {
    if (thread.status !== "pending" || thread.label) continue
    const parent = thread.parentThreadID ? session.threads.find((item) => item.id === thread.parentThreadID) : undefined
    thread.label = nextLabel(session.threads, parent)
    any = true
  }
  if (any) changed(state)
}
