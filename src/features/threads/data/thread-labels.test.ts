import test from "node:test"
import assert from "node:assert/strict"
import { indexOfLetters, lettersFor, nextLabel } from "./thread-labels.js"
import type { ReplyThread } from "./thread-types.js"

const t = (id: string, label?: string, parentThreadID?: string): ReplyThread => ({
  id, sessionID: "s", ...(label ? { label } : {}), ...(parentThreadID ? { parentThreadID } : {}),
  quote: { raw: "q", normalized: "q" }, comment: "c", anchor: { confidence: "unmatched" }, status: "sent",
  createdAt: "", updatedAt: "",
})

test("letters are bijective base 26 and round-trip", () => {
  assert.deepEqual([1, 2, 26, 27, 28, 52, 53, 702, 703].map(lettersFor), ["a", "b", "z", "aa", "ab", "az", "ba", "zz", "aaa"])
  for (const n of [1, 5, 26, 27, 100, 702, 703, 5000]) assert.equal(indexOfLetters(lettersFor(n)), n)
})

test("top-level labels continue across batches: 1, 2, 3...", () => {
  assert.equal(nextLabel([]), "1")
  assert.equal(nextLabel([t("a", "1")]), "2")
  assert.equal(nextLabel([t("a", "1"), t("b", "2"), t("c", "1a", "a")]), "3", "follow-ups do not consume top-level numbers")
})

test("follow-ups alternate letters and digits so a label parses one way", () => {
  const one = t("a", "1")
  assert.equal(nextLabel([one], one), "1a")
  const oneA = t("b", "1a", "a")
  assert.equal(nextLabel([one, oneA], one), "1b")
  assert.equal(nextLabel([one, oneA], oneA), "1a1")
  const oneA1 = t("c", "1a1", "b")
  assert.equal(nextLabel([one, oneA, oneA1], oneA), "1a2")
  assert.equal(nextLabel([one, oneA, oneA1], oneA1), "1a1a")
})

test("siblings are numbered per parent, not across the session", () => {
  const one = t("a", "1"); const two = t("b", "2")
  const oneA = t("c", "1a", "a")
  assert.equal(nextLabel([one, two, oneA], two), "2a")
  assert.equal(nextLabel([one, two, oneA], one), "1b")
})

test("a label already taken is skipped, never duplicated", () => {
  const one = t("a", "1")
  const stray = t("x", "1a") // taken but not recorded as a child of `one`
  assert.equal(nextLabel([one, stray], one), "1b")
})

test("legacy threads without labels are ignored", () => {
  assert.equal(nextLabel([t("a"), t("b")]), "1")
  assert.equal(nextLabel([t("a"), t("b", "4")]), "5")
})
