import test from "node:test"
import assert from "node:assert/strict"
import { attributeQuote } from "./quote-attribution.js"
import { normalizeForMatch } from "../../../shared/text/normalize-for-match.js"
import type { SourceMessage } from "../../threads/data/thread-types.js"

const assistant = (id: string, ...text: string[]): SourceMessage => ({
  id,
  type: "assistant",
  content: text.map((value) => ({ type: "text", text: value })),
})

test("normalizes terminal controls, Unicode, line endings, and horizontal whitespace", () => {
  assert.equal(normalizeForMatch("\u001b[31mCafe\u0301\t value\r\nnext  \u001b[0m"), "Café value\nnext")
})

test("returns an exact message and content-block anchor for one occurrence", () => {
  const result = attributeQuote("selected text", [assistant("msg_1", "Before selected   text after")])
  assert.equal(result.confidence, "exact")
  assert.equal(result.messageID, "msg_1")
  assert.equal(result.contentIndex, 0)
})

test("does not use recency to hide duplicate matches", () => {
  const result = attributeQuote("same", [assistant("msg_old", "same"), assistant("msg_new", "same")])
  assert.equal(result.confidence, "ambiguous")
  assert.equal(result.candidates.length, 2)
})

test("counts repeated occurrences in one content block as ambiguous", () => {
  const result = attributeQuote("same", [assistant("msg_1", "same then same")])
  assert.equal(result.confidence, "ambiguous")
  assert.equal(result.candidates.length, 2)
})

test("returns unmatched for empty and missing selections", () => {
  assert.equal(attributeQuote("  ", []).confidence, "unmatched")
  assert.equal(attributeQuote("missing", [assistant("msg_1", "other")]).confidence, "unmatched")
})
