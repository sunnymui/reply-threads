import { createHash } from "node:crypto"
import type { ReplyThread } from "../../threads/data/thread-types.js"

/**
 * Formats every selected line as a visibly delimited quote in the model prompt.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @returns The raw text with every line prefixed by the prompt quote marker.
 */
function quoteBlock(value: string): string {
  return value.split("\n").map((line) => `> ${line}`).join("\n")
}

// Token-lean on purpose: ~20 tokens of fixed overhead plus ~7 per thread
// (measured with o200k_base). The quotes themselves dominate the cost, so the
// template keeps only what the model needs: which thread, what was quoted, and
// the comment. The chat shows user messages as plain text (no bold or color), so
// the comment starts after a blank line with an all-caps label: it is easy to spot
// where the quote ends and the comment begins, and neither costs extra tokens
// (`COMMENT:` and `Comment:` are both 2 tokens; a blank line is free). The label
// also means a comment that starts with `>` is never mistaken for a quote.
//
// The instruction asks for one heading per comment, named by its label (`## 1a`).
// That is what lets the plugin tie each part of the answer to one specific comment
// (see replies.ts). When the batch contains a follow-up, the example uses a real
// label from it, so the model also sees which comment it follows up on.
const PARENT_LABEL = /^(.*?)(?:[a-z]+|\d+)$/

/**
 * Extracts the immediate parent from a label such as 1a2.
 *
 * @param label - Session-local hierarchical comment label.
 * @returns The immediate parent label, or undefined for a top-level label.
 */
export function parentLabelOf(label: string): string | undefined {
  const parent = PARENT_LABEL.exec(label)?.[1]
  return parent || undefined
}

/**
 * Explains the per-comment heading protocol and follow-up lineage to the model.
 *
 * @param threads - Ordered thread records for the current session.
 * @returns The model-facing heading instruction, with an actual follow-up example when present.
 */
export function batchInstruction(threads: readonly ReplyThread[]): string {
  const followUp = threads.find((thread) => thread.label && parentLabelOf(thread.label))
  if (followUp?.label) {
    return `Reply to each comment under a heading with its label (## ${followUp.label}); ${followUp.label} follows up on ${parentLabelOf(followUp.label)}. Then ## Revised, if needed.`
  }
  const first = threads[0]?.label ?? "1"
  return `Reply to each comment under a heading with its number (## ${first}). Then ## Revised, if needed.`
}

export interface BatchParts {
  /** Instruction line. Sent to the model; hidden from the chat when sent as the label message. */
  instruction: string
  /** The threads. This is what appears as the visible user message in labeled mode. */
  body: string
  /** Display-only text for the grey chat label (the model never receives it). */
  label: string
}

/**
 * Creates the display-only synthetic-message label shown in chat.
 *
 * @param count - Number of comments in the batch.
 * @returns The chat-only batch description, with singular/plural comment wording.
 */
export const batchLabel = (count: number): string => `Reply Threads · ${count} ${count === 1 ? "comment" : "comments"}`

/**
 * Builds the model instruction, visible thread body and display label without mutating thread
 * state.
 *
 * @param threads - Ordered thread records for the current session.
 * @returns Instruction, thread body and display label for the supplied ordered threads.
 */
export function composeBatchParts(threads: readonly ReplyThread[]): BatchParts {
  if (threads.length === 0) throw new Error("Cannot compose an empty reply-thread batch")
  const body = threads
    .map((thread, index) => `${thread.label ?? index + 1}.\n${quoteBlock(thread.quote.raw)}\n\nCOMMENT: ${thread.comment}`)
    .join("\n\n")
  return { instruction: batchInstruction(threads), body, label: batchLabel(threads.length) }
}

/**
 * Combines instruction and body into the logical prompt used by queued sends and reconciliation
 * hashes.
 *
 * @param threads - Ordered thread records for the current session.
 * @returns The instruction and body joined into one complete logical prompt.
 */
export function composeBatch(threads: readonly ReplyThread[]): string {
  const { instruction, body } = composeBatchParts(threads)
  return `${instruction}\n\n${body}`
}

/**
 * Hashes the complete logical prompt so reconciliation can distinguish the admitted batch from
 * unrelated messages.
 *
 * @param prompt - Complete logical instruction-plus-body text used for admission or hashing.
 * @returns A sha256:-prefixed hexadecimal digest of the complete logical prompt.
 */
export function promptHash(prompt: string): string {
  return `sha256:${createHash("sha256").update(prompt, "utf8").digest("hex")}`
}

/**
 * Creates stable metadata used to find an admitted batch in session history.
 *
 * @param batchID - Stable batch identifier stored before submission.
 * @param hash - Hash of the batch’s complete logical prompt.
 * @returns The replyThreadsBatchID and replyThreadsPromptHash metadata fields.
 */
export function batchMetadata(batchID: string, hash: string): Record<string, string> {
  return { replyThreadsBatchID: batchID, replyThreadsPromptHash: hash }
}
