import { normalizeForMatch } from "../../../shared/text/normalize-for-match.js"
import type { AttributionResult, SourceMessage } from "../../threads/data/thread-types.js"

/**
 * Searches all assistant text blocks for a quote and records exact, ambiguous or unmatched
 * attribution without guessing.
 *
 * @param rawQuote - Unmodified selected or explicitly quoted source text.
 * @param messages - Chronological session messages used to find the prompt’s assistant turn.
 * @returns Confidence and normalized quote, with source coordinates only for a unique match and
 *   all candidate matches retained.
 */
export function attributeQuote(rawQuote: string, messages: readonly SourceMessage[]): AttributionResult {
  const normalized = normalizeForMatch(rawQuote)
  if (!normalized) return { confidence: "unmatched", normalized, candidates: [] }

  const candidates: AttributionResult["candidates"] = []
  for (const message of messages) {
    if (message.type !== "assistant") continue
    for (const [contentIndex, content] of message.content.entries()) {
      if (content.type !== "text") continue
      const source = normalizeForMatch(content.text)
      let from = 0
      while (from <= source.length) {
        const start = source.indexOf(normalized, from)
        if (start === -1) break
        candidates.push({ messageID: message.id, contentIndex, start, end: start + normalized.length })
        from = start + Math.max(1, normalized.length)
      }
    }
  }

  if (candidates.length === 1) return { confidence: "exact", normalized, ...candidates[0], candidates }
  if (candidates.length > 1) return { confidence: "ambiguous", normalized, candidates }
  return { confidence: "unmatched", normalized, candidates }
}
