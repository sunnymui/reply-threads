import type { Context } from "@opencode/plugin/tui/context"
import type { HistoryMessage } from "../features/replies/reply-history.js"
import type { SourceMessage } from "../features/threads/data/thread-types.js"

type AnyMessage = {
  id: string
  type: string
  finish?: string
  content?: ReadonlyArray<{ type: string; text?: string }>
}

export interface HistorySnapshot {
  messages: HistoryMessage[]
  /** False when an API read failed and only partial/cached history is available. */
  complete: boolean
}

/**
 * Overlays live cache messages on chronological API history without dropping older entries.
 * Newly arrived cache messages are appended in their existing order.
 *
 * @param history - Earlier chronological snapshot, usually from the paginated API.
 * @param live - Current cache messages, which may cover only the newest part of the session.
 * @returns Combined history with one entry per message ID and live text for overlapping IDs.
 */
export function mergeHistory(history: readonly HistoryMessage[], live: readonly HistoryMessage[]): HistoryMessage[] {
  const messages = new Map(history.map((message) => [message.id, message]))
  for (const message of live) messages.set(message.id, message)
  return [...messages.values()]
}

/**
 * Projects an OpenCode message into the minimal history contract consumed by the replies
 * feature. This shared helper keeps host message details out of answer parsing and review
 * components.
 *
 * @param message - OpenCode message to project into the replies feature’s minimal history
 *   contract.
 * @returns A host-independent history message containing only the fields needed by reply
 *   derivation.
 */
const toHistory = (message: AnyMessage): HistoryMessage => ({
  id: message.id,
  type: message.type,
  ...(message.type === "assistant" ? { finish: message.finish } : {}),
  ...(message.type === "assistant" ? { content: (message.content ?? []).map((item) => ({ type: item.type, text: item.text })) } : {}),
})

/**
 * Provides synchronous access to OpenCode’s reactive message cache for the threads panel and
 * sidebar. Unlike readHistory, this may contain only the loaded portion of a session.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns Loaded history messages in cache order, or an empty array if the host cache cannot be
 *   read.
 */
export function cachedHistory(context: Context, sessionID: string): HistoryMessage[] {
  try {
    return context.data.session.message.list(sessionID).map((message) => toHistory(message as AnyMessage))
  } catch {
    return []
  }
}

/**
 * Reads host execution status for reply derivation so review surfaces distinguish an open
 * running turn from an idle turn without an answer.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns True for running host status, or false when idle or status access fails.
 */
export function sessionRunning(context: Context, sessionID: string): boolean {
  try {
    return context.data.session.status(sessionID) === "running"
  } catch {
    return false
  }
}

/**
 * Loads chronological history for annotation and reply matching through the host-provided
 * paginated client. Keeps fetched pages and overlays cached messages if an API read fails.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns Chronological API history, or a best-effort partial history if the API read fails.
 */
export async function readHistory(context: Context, sessionID: string): Promise<HistoryMessage[]> {
  return (await readHistorySnapshot(context, sessionID)).messages
}

/**
 * Loads all message pages and records whether the result is authoritative or a fallback.
 * Cursor tokens already encode ordering; sending order again is rejected by the host.
 *
 * @param context - Connected host client and cache access.
 * @param sessionID - Session whose complete history is requested.
 * @returns Chronological messages and whether every page was read successfully.
 */
export async function readHistorySnapshot(context: Context, sessionID: string): Promise<HistorySnapshot> {
  const messages: AnyMessage[] = []
  let cursor: string | undefined
  try {
    do {
      const page = await context.client.message.list({ sessionID, limit: 100, ...(cursor ? { cursor } : { order: "desc" as const }) })
      messages.push(...(page.data as AnyMessage[]))
      cursor = page.cursor.next ?? undefined
    } while (cursor)
  } catch {
    // beta-19271 can expose the TUI client before the paginated message route
    // is ready. The synchronized cache is still sufficient for a best-effort
    // anchor and is preferable to losing the user's annotation.
    return { messages: mergeHistory(messages.reverse().map(toHistory), cachedHistory(context, sessionID)), complete: false }
  }
  return { messages: messages.reverse().map(toHistory), complete: true }
}

/**
 * Projects history into assistant text blocks for the annotate feature’s quote attribution,
 * without changing the original message content.
 *
 * @param history - General session history returned by the shared OpenCode history helper.
 * @returns Assistant messages containing text blocks suitable for quote attribution.
 */
export function toSourceMessages(history: readonly HistoryMessage[]): SourceMessage[] {
  return history.flatMap((message) => {
    if (message.type !== "assistant") return []
    return [{
      id: message.id,
      type: message.type,
      content: (message.content ?? []).flatMap((item) =>
        item.type === "text" && item.text !== undefined ? [{ type: "text" as const, text: item.text }] : [],
      ),
    }]
  })
}

/**
 * Loads only assistant text blocks for the annotation attribution workflow.
 *
 * @param context - Host-provided OpenCode APIs used by this operation.
 * @param sessionID - Session whose threads or history are being accessed.
 * @returns A promise resolving to assistant-only attribution messages from readHistory.
 */
export async function readAssistantMessages(context: Context, sessionID: string): Promise<SourceMessage[]> {
  return toSourceMessages(await readHistory(context, sessionID))
}
