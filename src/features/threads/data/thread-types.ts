export type ThreadStatus = "pending" | "sending" | "sent" | "resolved"
export type BatchStatus = "submitting" | "sent" | "failed" | "unknown"
export type AnchorConfidence = "exact" | "ambiguous" | "unmatched"

export interface SourceTextContent {
  type: "text"
  text: string
}

export interface SourceMessage {
  id: string
  type: string
  content: readonly SourceTextContent[]
}

export interface AttributionCandidate {
  messageID: string
  contentIndex: number
  start: number
  end: number
}

export interface AttributionResult {
  confidence: AnchorConfidence
  normalized: string
  messageID?: string
  contentIndex?: number
  start?: number
  end?: number
  candidates: AttributionCandidate[]
}

export interface ReplyThread {
  id: string
  sessionID: string
  /**
   * Session-unique label (`1`, `1a`, `1a2`) shown in the prompt and used to match
   * the model's answer. Absent on threads saved before labels existed.
   */
  label?: string
  /** The earlier comment whose reply this one follows up on. */
  parentThreadID?: string
  messageID?: string
  contentIndex?: number
  quote: { raw: string; normalized: string }
  comment: string
  anchor: { confidence: AnchorConfidence; start?: number; end?: number }
  status: ThreadStatus
  batchID?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
}

export interface ReplyBatch {
  id: string
  sessionID: string
  threadIDs: string[]
  promptMessageID: string
  /**
   * Stable ID of the optional display-label message (a synthetic message). It is
   * cancelled if the real prompt is definitively not admitted, so it can never
   * leak into a later prompt.
   */
  labelMessageID?: string
  promptHash: string
  status: BatchStatus
  admittedMessageID?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
}

export interface SessionThreadState {
  threads: ReplyThread[]
  batches: ReplyBatch[]
}

export interface ThreadRepositoryState {
  schemaVersion: 1
  revision: number
  sessions: Record<string, SessionThreadState>
}

/**
 * Creates an empty version-one repository with no sessions, threads or batches.
 *
 * @returns A fresh schema-version-one repository with revision zero and no sessions.
 */
export const initialRepositoryState = (): ThreadRepositoryState => ({ schemaVersion: 1, revision: 0, sessions: {} })
