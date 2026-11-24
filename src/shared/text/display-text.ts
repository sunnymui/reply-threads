/**
 * Collapses whitespace for compact single-line UI previews.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @returns The whitespace-collapsed and trimmed preview string.
 */
export function flattenText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Clips a compact UI string and adds an ellipsis when it exceeds the limit.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @param limit - Maximum displayed length including the ellipsis.
 * @returns The flattened string, shortened with an ellipsis when it exceeds the display limit.
 */
export function clipText(value: string, limit: number): string {
  const flat = flattenText(value)
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}
