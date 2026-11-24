import type { ReplyBatch, ReplyThread } from "../threads/data/thread-types.js"

/**
 * Minimal chronological-message contract used by the replies feature and populated by
 * opencode-helpers/message-history.ts. User and synthetic entries delimit assistant turns;
 * assistant entries provide text for heading parsing and follow-up matching.
 */
export interface HistoryMessage {
  id: string
  type: string
  finish?: string
  content?: readonly { type: string; text?: string }[]
}

/** One parsed answer section with the assistant message IDs that contributed its text. */
export interface ReplySection {
  text: string
  messageIDs: string[]
}

/** Derived answer for a sent batch; recomputed from history rather than persisted by threads. */
export interface BatchReply {
  /**
   * missing: the batch's prompt is not in the loaded history.
   * running: the turn is still open and the session is running.
   * empty:   the turn ended without any assistant text.
   * done:    the model answered.
   */
  state: "missing" | "running" | "empty" | "done"
  messageIDs: string[]
  /** Keyed by thread ID: the part of the answer under that comment's heading. */
  sections: Record<string, ReplySection>
  /** The last non-empty assistant text of the turn: the fallback when the model used no headings. */
  finalText: string
  sectioned: boolean
}

const KEYWORD = String.raw`(?:(?:comment|thread|reply|response|re)[ \t]+)?`
// A label alternates digits and letters: `1`, `1a`, `1a2`, `12bc`.
const LABEL = String.raw`(\d{1,3}(?:[a-z]{1,2}\d{1,3})*(?:[a-z]{1,2})?)`
// `## 1a`, `## 1a.`, `### Thread 2`, `## Comment 3:`, `## 1. Title`, `## 1 - Title`. Not `## 2 options`.
const HEADING_MARKER = new RegExp(
  String.raw`^ {0,3}(#{1,6})[ \t]+(?:\*\*)?${KEYWORD}#?${LABEL}(?:\*\*)?(?:$|[.):][ \t]*(?:\*\*)?.*$|[ \t]*[—–-][ \t]+.*$)`,
  "i",
)
// `**1a.**`, `**Thread 2**`, `**Thread 2:**` alone on a line.
const BOLD_MARKER = new RegExp(String.raw`^ {0,3}\*\*${KEYWORD}#?${LABEL}[.):]?\*\*[ \t]*$`, "i")
const ANY_HEADING = /^ {0,3}(#{1,6})[ \t]+\S/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const FENCE = /^ {0,3}(```|~~~)/

/**
 * Recognizes a supported model heading and returns its level and normalized thread label.
 *
 * @param line - One unfenced line of model answer source.
 * @returns The heading level and normalized label, or undefined when the line is not a supported
 *   marker.
 */
function marker(line: string): { level: number; label: string } | undefined {
  const heading = HEADING_MARKER.exec(line)
  if (heading) return { level: heading[1].length, label: heading[2].toLowerCase() }
  const bold = BOLD_MARKER.exec(line)
  if (bold) return { level: 0, label: bold[1].toLowerCase() }
  return undefined
}

/**
 * Splits model answer blocks at headings belonging to the current batch, ignoring code-fence
 * headings and unrelated prose.
 *
 * Only the first occurrence of an expected label opens a section. Code fences suppress heading
 * parsing; a same-or-higher heading or horizontal rule closes the current section.
 *
 * @param blocks - Ordered source text blocks and their message IDs.
 * @param expected - Labels belonging to the batch; other headings cannot start answer sections.
 * @returns Nonempty answer sections keyed by expected thread labels, with their source message
 *   IDs.
 */
export function parseSections(
  blocks: readonly { messageID: string; text: string }[],
  expected: ReadonlySet<string>,
): Map<string, ReplySection> {
  const sections = new Map<string, ReplySection>()
  let current: { label: string; level: number; lines: string[]; ids: Set<string> } | undefined
  let inFence = false

  /**
   * Commits the currently accumulated reply section when parsing reaches a boundary.
   *
   * @returns Nothing; stores any nonempty accumulated section and clears the current parser state.
   */
  const close = () => {
    if (!current) return
    const text = current.lines.join("\n").trim()
    if (text) sections.set(current.label, { text, messageIDs: [...current.ids] })
    current = undefined
  }

  for (const block of blocks) {
    for (const line of block.text.split(/\r?\n/)) {
      if (FENCE.test(line)) {
        inFence = !inFence
        if (current) { current.lines.push(line); current.ids.add(block.messageID) }
        continue
      }
      if (inFence) {
        if (current) { current.lines.push(line); current.ids.add(block.messageID) }
        continue
      }
      const found = marker(line)
      if (found && expected.has(found.label) && !sections.has(found.label) && current?.label !== found.label) {
        close()
        current = { label: found.label, level: found.level, lines: [], ids: new Set([block.messageID]) }
        continue
      }
      if (!current) continue
      const heading = ANY_HEADING.exec(line)
      if ((heading && (current.level === 0 || heading[1].length <= current.level)) || RULE.test(line)) {
        close()
        continue
      }
      current.lines.push(line)
      current.ids.add(block.messageID)
    }
    if (current) current.lines.push("")
  }
  close()
  return sections
}

/**
 * Extracts non-empty text blocks from one assistant history message.
 *
 * @param message - Text describing the successful annotation save.
 * @returns Nonempty text block strings, excluding reasoning and tool content.
 */
export const textBlocks = (message: HistoryMessage) =>
  (message.content ?? []).flatMap((item) => (item.type === "text" && item.text?.trim() ? [item.text] : []))

/**
 * Derives the assistant turn after a batch prompt, including per-label sections and fallback
 * reply state.
 *
 * A turn may contain many assistant messages because tool steps are separate messages. A
 * subsequent user or synthetic message ends the turn; no answer text is persisted by this
 * feature.
 *
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @param threads - Ordered thread records for the current session.
 * @param messages - Chronological session messages used to find the prompt’s assistant turn.
 * @param running - Whether the host session is currently running, used to classify an open turn.
 * @returns Derived turn status, assistant message IDs, sections keyed by thread ID, and last-
 *   text fallback.
 */
export function deriveBatchReply(
  batch: ReplyBatch,
  threads: readonly ReplyThread[],
  messages: readonly HistoryMessage[],
  running: boolean,
): BatchReply {
  const promptID = batch.admittedMessageID ?? batch.promptMessageID
  const start = messages.findIndex((message) => message.id === promptID)
  if (start < 0) return { state: "missing", messageIDs: [], sections: {}, finalText: "", sectioned: false }

  const turn: HistoryMessage[] = []
  let open = true
  for (const message of messages.slice(start + 1)) {
    if (message.type === "user" || message.type === "synthetic") { open = false; break }
    if (message.type === "assistant") turn.push(message)
  }

  const blocks = turn.flatMap((message) => textBlocks(message).map((text) => ({ messageID: message.id, text })))
  const finalText = [...turn].reverse().map((message) => textBlocks(message).join("\n\n")).find(Boolean) ?? ""
  const threadByLabel = new Map<string, string>()
  for (const id of batch.threadIDs) {
    const label = threads.find((thread) => thread.id === id)?.label
    if (label) threadByLabel.set(label.toLowerCase(), id)
  }
  const parsed = parseSections(blocks, new Set(threadByLabel.keys()))
  const sections: Record<string, ReplySection> = {}
  for (const [label, section] of parsed) sections[threadByLabel.get(label)!] = section

  const state = open && running ? "running" : blocks.length === 0 ? "empty" : "done"
  return { state, messageIDs: turn.map((message) => message.id), sections, finalText, sectioned: parsed.size > 0 }
}
