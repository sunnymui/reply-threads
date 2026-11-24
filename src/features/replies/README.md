# Reading model answers

This feature finds the model's answer to each comment and links follow-up comments to it.

- `reply-history.ts`: reads answer headings and groups assistant messages into turns. A
  batch's turn starts after its user prompt and ends at the next user or synthetic message.
  Only headings matching that batch's labels become separate comment answers.
- `parent-resolution.ts`: matches selected text to earlier answers, ignoring Markdown that
  the terminal does not display. It links a parent only when the match is unique.
- `ReplyBlock.tsx`: draws the answer or status, expands long text and shows the Reply button.
- `review-history.tsx`: loads complete history and adds live updates from OpenCode's cache.

Answers are read from chat history, not copied into thread storage or written back to chat.
The threads feature provides the answer states used by cards and sidebar rows.

## Keep older answers available

Reload history when the session or sent prompt IDs change. Removing a pending comment must
not clear loaded history or change sent batches. If a refresh fails, keep the earlier history
for that session. Never show it in a different session.

Review components use `createReviewHistory`. Lint blocks direct reads from the recent-message
cache there because that cache may omit older, intact answers. Loaded history stays in
memory for the mounted view; it is not added to saved thread data.

## Matching and display rules

- A turn may contain several assistant messages, including tool steps.
- If headings are missing, show the whole answer under the first comment and point the rest to it.
- A one-comment batch can use its whole answer when matching a follow-up.
- Never choose a parent just because its answer was recent.
- Handle every `NodeReply` case in status switches. A default branch does not satisfy the
  exhaustive-switch lint rule when a new state is added.

Tests cover headings, code fences, ambiguous quotes, missing messages, history refresh failures,
session changes and preserving answers after a pending comment is discarded.

## Related changes

- **Support a new heading or label format:** check [reply-history.ts](reply-history.ts),
  [compose-prompt.ts](../send/preparation/compose-prompt.ts) and
  [thread-labels.ts](../threads/data/thread-labels.ts). Requested headings must match what
  the parser recognizes. Update prompt, label and reply-history tests together.
- **Add an answer status:** check `NodeReply` in [thread-tree.ts](../threads/review/thread-tree.ts),
  [ReplyBlock.tsx](ReplyBlock.tsx) and [SidebarEntry.tsx](../threads/sidebar/SidebarEntry.tsx).
  The full answer block and compact marker both need to represent the new status.
- **Change the history message shape:** check [message-history.ts](../../opencode-helpers/message-history.ts)
  and [review-history.tsx](review-history.tsx). The helper builds the messages consumed by
  parsing and parent matching; history and panel tests cover those connections.
- **Change follow-up matching:** check [parent-resolution.ts](parent-resolution.ts) and
  [annotation-workflow.tsx](../annotate/annotation-workflow.tsx). Selected quotes use matching,
  while Reply buttons supply an explicit parent and must keep quoting the complete answer.
