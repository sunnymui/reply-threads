import { stripVTControlCharacters } from "node:util"

/**
 * Provides the shared comparison normalization used by annotation attribution and reply parent
 * resolution. Removes terminal control sequences and normalizes Unicode/whitespace without
 * modifying stored raw quotes.
 *
 * @param value - Source value to transform without modifying the caller’s original.
 * @returns Normalized comparison text; the caller’s raw quote remains unchanged.
 */
export function normalizeForMatch(value: string): string {
  return stripVTControlCharacters(value)
    .normalize("NFC")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trimEnd())
    .join("\n")
    .trim()
}
