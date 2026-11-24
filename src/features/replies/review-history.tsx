import type { Context } from "@opencode/plugin/tui/context"
import { createMemo, createResource } from "solid-js"
import type { ReplyBatch } from "../threads/data/thread-types.js"
import { cachedHistory, mergeHistory, readHistorySnapshot } from "../../opencode-helpers/message-history.js"
import type { HistoryMessage } from "./reply-history.js"

/**
 * Supplies complete review history while overlaying live assistant updates from the host cache.
 * Reloads for a new session or sent prompt, not for unrelated pending-comment changes.
 *
 * @param options - Connected host APIs and reactive session/batch accessors for this surface.
 * @returns A reactive chronological history accessor scoped to the current session.
 */
export function createReviewHistory(options: {
  context: Context
  sessionID: () => string
  batches: () => readonly ReplyBatch[]
}): () => HistoryMessage[] {
  const request = createMemo(() => {
    const prompts = options.batches().filter((batch) => batch.status === "sent").map((batch) => batch.admittedMessageID ?? batch.promptMessageID)
    return prompts.length > 0 ? JSON.stringify({ sessionID: options.sessionID(), prompts }) : false
  })
  const [snapshot] = createResource<{ sessionID: string; messages: HistoryMessage[] }, string>(request, async (key, previous) => {
    const { sessionID } = JSON.parse(key) as { sessionID: string }
    const result = await readHistorySnapshot(options.context, sessionID)
    const earlier = previous.value?.sessionID === sessionID ? previous.value.messages : []
    return {
      sessionID,
      // A partial fallback must not erase a previously loaded complete history.
      messages: result.complete ? result.messages : mergeHistory(earlier, result.messages),
    }
  })
  return createMemo(() => {
    const sessionID = options.sessionID()
    const loaded = snapshot()
    return mergeHistory(loaded?.sessionID === sessionID ? loaded.messages : [], cachedHistory(options.context, sessionID))
  })
}
