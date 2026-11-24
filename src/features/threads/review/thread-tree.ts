import { deriveBatchReply, type BatchReply, type HistoryMessage } from "../../replies/reply-history.js"
import type { ReplyBatch, ReplyThread } from "../data/thread-types.js"

/** Answer state derived by the threads feature for ReplyBlock and compact sidebar status. */
export type NodeReply =
  | { kind: "section"; text: string }
  /** No per-comment headings: the whole answer, shown once under the first comment of the batch. */
  | { kind: "whole"; text: string; comments: number }
  /** The whole answer is shown under a sibling comment. */
  | { kind: "shared" }
  /** The model answered other comments of this batch but not this one. */
  | { kind: "unanswered" }
  | { kind: "running" }
  | { kind: "empty" }
  /** The batch's prompt is not in the loaded history. */
  | { kind: "missing" }
  /** Sent before comments had labels, so the model's answer cannot be matched to it. */
  | { kind: "legacy" }

export interface ThreadNode {
  thread: ReplyThread
  reply: NodeReply
  children: ThreadNode[]
}

export interface ThreadRow {
  node: ThreadNode
  depth: number
}

/**
 * Maps the replies feature’s derived batch answer to the state shown beneath one thread card.
 * This supplies the shared answer-state contract used by ReplyBlock and the compact sidebar.
 *
 * @param thread - Thread record from the session repository.
 * @param batch - Batch record whose prompt, thread IDs and admission state are used.
 * @param reply - Derived answer or status for one batch or comment.
 * @returns The comment’s section, shared-answer fallback or unavailable/running status for
 *   review.
 */
function replyFor(thread: ReplyThread, batch: ReplyBatch | undefined, reply: BatchReply | undefined): NodeReply {
  if (!thread.label) return { kind: "legacy" }
  if (!batch || !reply) return { kind: "missing" }
  if (reply.state === "missing") return { kind: "missing" }
  if (reply.state === "running") return { kind: "running" }
  if (reply.state === "empty") return { kind: "empty" }
  const section = reply.sections[thread.id]
  if (section) return { kind: "section", text: section.text }
  if (reply.sectioned) return { kind: "unanswered" }
  const first = batch.threadIDs[0] === thread.id
  return first
    ? { kind: "whole", text: reply.finalText, comments: batch.threadIDs.length }
    : { kind: "shared" }
}

/**
 * Builds review conversations from sent or sending threads, delegating answer derivation to the
 * replies feature. Keeps parents above children, ranks root conversations by latest send and
 * retains oldest-first follow-ups.
 *
 * Unknown or later parents become roots instead of dropping comments or forming cycles. Threads
 * in the same send keep repository order.
 *
 * @param threads - Ordered thread records for the current session.
 * @param batches - Session batches in send order.
 * @param messages - Chronological session messages used to find the prompt’s assistant turn.
 * @param running - Whether the host session is currently running, used to classify an open turn.
 * @returns Root conversation nodes with ordered children and derived model-answer states.
 */
export function buildThreadTree(
  threads: readonly ReplyThread[],
  batches: readonly ReplyBatch[],
  messages: readonly HistoryMessage[],
  running: boolean,
): ThreadNode[] {
  const replies = new Map<string, BatchReply>()
  /**
   * Caches each batch answer within one tree-building pass so sibling comments reuse the same
   * reply derivation.
   *
   * @param batch - Batch record whose prompt, thread IDs and admission state are used.
   * @returns The cached or newly derived answer for this batch within the current tree build.
   */
  const replyOf = (batch: ReplyBatch) => {
    let reply = replies.get(batch.id)
    if (!reply) replies.set(batch.id, (reply = deriveBatchReply(batch, threads, messages, running)))
    return reply
  }

  const nodes = new Map<string, ThreadNode>()
  const roots: ThreadNode[] = []
  for (const thread of threads) {
    if (thread.status === "pending") continue
    const batch = batches.find((item) => item.id === thread.batchID)
    const node: ThreadNode = { thread, reply: replyFor(thread, batch, batch ? replyOf(batch) : undefined), children: [] }
    const parent = thread.parentThreadID ? nodes.get(thread.parentThreadID) : undefined
    // Only attach to an already-seen (older) node, so a bad link can never form a cycle.
    if (parent) parent.children.push(node)
    else roots.push(node)
    nodes.set(thread.id, node)
  }

  // Conversations (roots) are newest first, ranked by their latest send at any depth,
  // so one you just followed up on moves to the top. Inside a conversation the
  // follow-ups read top to bottom, oldest first. A parent therefore always precedes
  // its follow-ups, and comments sent together keep their label order. The order of
  // `batches` is send order; unlike timestamps it never ties.
  const position = new Map(threads.map((thread, index) => [thread.id, index]))
  /**
   * Returns the send-order rank used to order root conversations.
   *
   * @param thread - Thread record from the session repository.
   * @returns The batch’s position in send order, or -1 when it is missing.
   */
  const sendRank = (thread: ReplyThread) => batches.findIndex((batch) => batch.id === thread.batchID)
  const activity = new Map<ThreadNode, number>()
  /**
   * Computes the latest send rank in a conversation including descendants.
   *
   * @param node - Conversation node currently being visited.
   * @returns The greatest send-order rank in this node’s subtree, also cached for sorting.
   */
  const latest = (node: ThreadNode): number => {
    let value = sendRank(node.thread)
    for (const child of node.children) value = Math.max(value, latest(child))
    activity.set(node, value)
    return value
  }
  for (const root of roots) latest(root)
  /**
   * Orders comments sent together by their stable repository position.
   *
   * @param a - First conversation node being compared.
   * @param b - Second conversation node being compared.
   * @returns A negative, zero or positive comparison preserving repository order.
   */
  const byPosition = (a: ThreadNode, b: ThreadNode) => (position.get(a.thread.id) ?? 0) - (position.get(b.thread.id) ?? 0)
  /**
   * Recursively orders follow-ups from oldest to newest within a conversation.
   *
   * @param list - Sibling nodes to sort in place.
   * @returns Nothing; recursively sorts child lists in place by repository position.
   */
  const oldestFirst = (list: ThreadNode[]) => {
    list.sort(byPosition)
    for (const node of list) oldestFirst(node.children)
  }
  for (const root of roots) oldestFirst(root.children)
  roots.sort((a, b) => (activity.get(b) ?? 0) - (activity.get(a) ?? 0) || byPosition(a, b))
  return roots
}

/**
 * Flattens the threads review forest into depth-first display rows consumed by ThreadPanel and
 * SidebarEntry. Caps visual indentation without discarding deeper descendants.
 *
 * @param roots - Ordered root conversations from buildThreadTree.
 * @param maxDepth - Maximum visual indentation depth; deeper rows remain present.
 * @returns Depth-first rows with indentation capped at maxDepth.
 */
export function flattenTree(roots: readonly ThreadNode[], maxDepth = 4): ThreadRow[] {
  const rows: ThreadRow[] = []
  /**
   * Adds one tree node to the flattened depth-first rendering rows.
   *
   * @param node - Conversation node currently being visited.
   * @param depth - Uncapped nesting depth of this node.
   * @returns Nothing; appends this node and recursively appends its descendants to the row
   *   accumulator.
   */
  const visit = (node: ThreadNode, depth: number) => {
    rows.push({ node, depth: Math.min(depth, maxDepth) })
    for (const child of node.children) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  return rows
}
