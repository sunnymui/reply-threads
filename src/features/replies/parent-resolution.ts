import type { ReplyBatch, ReplyThread } from "../threads/data/thread-types.js"
import { normalizeForMatch } from "../../shared/text/normalize-for-match.js"
import { deriveBatchReply, textBlocks, type HistoryMessage } from "./reply-history.js"

export interface ParentLink {
  /** The comment whose reply the quote was selected from. */
  parentThreadID?: string
  /**
   * The quote was found in one batch's reply but could not be pinned to one of
   * its comments (the model used no per-comment headings). Never guessed.
   */
  unpinned?: boolean
}

/**
 * Removes Markdown presentation so a terminal selection can be matched against a stored model
 * answer.
 *
 * Terminal selections contain rendered text while history contains Markdown source. Apply this
 * comparison form to both sides; preserve the raw quote separately.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @returns A whitespace-collapsed, Markdown-tolerant comparison string.
 */
export function squash(value: string): string {
  return normalizeForMatch(value)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d{1,3}[.)])[ \t]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Finds the sole prior comment whose derived answer contains a selected quote; it deliberately
 * returns no parent when the evidence is ambiguous.
 *
 * Source attribution is deliberately separate. Multiple matching batches or no matches yield no
 * parent; an ambiguous multi-comment answer within one batch is reported as unpinned rather than
 * guessed.
 *
 * @param input - Selected quote, session threads/batches and loaded history to search for a
 *   unique parent.
 * @returns A unique parentThreadID, an unpinned flag for an unresolved multi-comment batch, or
 *   an empty link.
 */
export function resolveParent(input: {
  quote: string
  batches: readonly ReplyBatch[]
  threads: readonly ReplyThread[]
  messages: readonly HistoryMessage[]
}): ParentLink {
  const needle = squash(input.quote)
  if (!needle) return {}

  const hits: { batch: ReplyBatch; threadIDs: string[] }[] = []
  for (const batch of input.batches) {
    if (batch.status === "failed") continue
    const reply = deriveBatchReply(batch, input.threads, input.messages, false)
    if (reply.state === "missing") continue
    const inSections = Object.entries(reply.sections)
      .filter(([, section]) => squash(section.text).includes(needle))
      .map(([threadID]) => threadID)
    const inTurn = inSections.length > 0 || input.messages.some(
      (message) => reply.messageIDs.includes(message.id) && textBlocks(message).some((text) => squash(text).includes(needle)),
    )
    if (inTurn) hits.push({ batch, threadIDs: inSections })
  }
  if (hits.length !== 1) return {}

  const [{ batch, threadIDs }] = hits
  if (threadIDs.length === 1) return { parentThreadID: threadIDs[0] }
  // One comment in the batch: the whole reply answers it, no headings needed.
  if (batch.threadIDs.length === 1) return { parentThreadID: batch.threadIDs[0] }
  return { unpinned: true }
}
