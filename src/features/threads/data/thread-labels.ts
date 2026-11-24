import type { ReplyThread } from "./thread-types.js"

/**
 * @file Session-local comment labels and hierarchical suffix allocation.
 *
 * Comment labels are unique within a session and encode the thread they belong to:
 *
 *   1, 2, 3        top-level comments (the count continues across batches)
 *   1a, 1b, 1c     follow-ups to comment 1
 *   1a1, 1a2       follow-ups to 1a
 *
 * Digits and letters alternate, so a label always parses one way. The label is
 * what the model sees and answers under (`## 1a`), which is how its reply is tied
 * to one specific comment.
 *
 * Labels are derived from existing threads rather than a stored counter. Sent
 * threads are never deleted, so a number is only ever reused when it belonged to a
 * pending thread that was never sent.
 */

/**
 * Encodes a positive integer as the letter portion of a hierarchical label.
 *
 * @param index - One-based sibling index to encode as a letter suffix.
 * @returns The bijective base-26 suffix, such as a, z or aa.
 */
export function lettersFor(index: number): string {
  let value = index
  let out = ""
  while (value > 0) {
    value--
    out = String.fromCharCode(97 + (value % 26)) + out
    value = Math.floor(value / 26)
  }
  return out
}

/**
 * Decodes a hierarchical label’s letter portion into its numeric sibling index.
 *
 * @param letters - Lowercase bijective base-26 suffix to decode.
 * @returns The one-based sibling index encoded by the letter suffix.
 */
export function indexOfLetters(letters: string): number {
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 96)
  return value
}

/**
 * Finds the next unused top-level or child label in a session.
 *
 * @param threads - Ordered thread records for the current session.
 * @param parent - Optional parent thread; without a labeled parent allocate a top-level number.
 * @returns The next unused root or hierarchical child label.
 */
export function nextLabel(threads: readonly ReplyThread[], parent?: ReplyThread): string {
  const taken = new Set(threads.flatMap((thread) => (thread.label ? [thread.label] : [])))
  const parentLabel = parent?.label
  let candidate: string
  let index: number

  if (!parentLabel) {
    index = Math.max(0, ...threads.flatMap((thread) => (thread.label && /^\d+$/.test(thread.label) ? [Number(thread.label)] : []))) + 1
    candidate = String(index)
    while (taken.has(candidate)) candidate = String(++index)
    return candidate
  }

  const lettersNext = /\d$/.test(parentLabel)
  const suffixes = threads.flatMap((thread) => {
    if (thread.parentThreadID !== parent?.id || !thread.label?.startsWith(parentLabel)) return []
    const suffix = thread.label.slice(parentLabel.length)
    if (lettersNext) return /^[a-z]+$/.test(suffix) ? [indexOfLetters(suffix)] : []
    return /^\d+$/.test(suffix) ? [Number(suffix)] : []
  })
  index = Math.max(0, ...suffixes) + 1
  /**
   * Builds one candidate child label from its parent and sibling index.
   *
   * @param n - One-based sibling index for this child-label candidate.
   * @returns The parent label with a digit or letter suffix appropriate for its depth.
   */
  const make = (n: number) => parentLabel + (lettersNext ? lettersFor(n) : String(n))
  candidate = make(index)
  while (taken.has(candidate)) candidate = make(++index)
  return candidate
}
