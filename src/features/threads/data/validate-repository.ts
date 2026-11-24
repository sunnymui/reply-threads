import { z } from "zod"
import type { ThreadRepositoryState } from "./thread-types.js"

const optionalID = z.string().min(1).optional()
const optionalIndex = z.number().int().nonnegative().optional()
const thread = z.object({
  id: z.string().min(1), sessionID: z.string().min(1),
  label: optionalID, parentThreadID: optionalID, messageID: optionalID, contentIndex: optionalIndex,
  quote: z.object({ raw: z.string(), normalized: z.string() }).passthrough(),
  comment: z.string(),
  anchor: z.object({ confidence: z.enum(["exact", "ambiguous", "unmatched"]), start: optionalIndex, end: optionalIndex }).passthrough(),
  status: z.enum(["pending", "sending", "sent", "resolved"]), batchID: optionalID,
  createdAt: z.string(), updatedAt: z.string(), sentAt: z.string().optional(),
}).passthrough()
const batch = z.object({
  id: z.string().min(1), sessionID: z.string().min(1), threadIDs: z.array(z.string().min(1)),
  promptMessageID: z.string().min(1), labelMessageID: optionalID, promptHash: z.string(),
  status: z.enum(["submitting", "sent", "failed", "unknown"]), admittedMessageID: optionalID,
  createdAt: z.string(), updatedAt: z.string(), sentAt: z.string().optional(),
}).passthrough()
const repository = z.object({
  schemaVersion: z.literal(1),
  // Early version-one files omitted this counter. No other fields are repaired automatically.
  revision: z.number().int().nonnegative().default(0),
  sessions: z.record(z.string(), z.object({ threads: z.array(thread), batches: z.array(batch) }).passthrough()),
}).passthrough()

/**
 * Checks the saved version-one shape without changing the supplied data. Unknown fields are
 * preserved; missing legacy revision counters normalize to zero. Unsupported formats fail.
 *
 * @param value - Untrusted data read from plugin storage or a repository update draft.
 * @returns Validated data with the known legacy revision default applied.
 */
export function validateRepository(value: unknown): ThreadRepositoryState {
  const result = repository.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`Saved Reply Threads data is incompatible at ${issue.path.join(".") || "repository"}: ${issue.message}. The saved data has not been replaced.`)
  }
  return result.data
}
