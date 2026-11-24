# Building the conversation tree

`thread-tree.ts` builds nested conversations and an ordered list of rows for the panel and
sidebar. It asks the replies feature to find the answers, then chooses the `NodeReply` state
each card or sidebar row displays.

Both views use this code so they agree on order:

- Conversations with the most recent sends come first.
- Follow-ups within a conversation stay oldest first.
- Comments sent together keep their repository order.
- A missing parent makes a comment a top-level row.
- Indentation has a display limit, but deeper comments remain in the list.

Answers are read from history, not saved in the repository. `thread-tree.test.ts` covers
ordering, nesting and answer states.

## Related changes

- **Change `ThreadRow`, depth or ordering:** check [thread-tree.ts](thread-tree.ts),
  [ThreadPanel.tsx](../panel/ThreadPanel.tsx), [SentThreadCard.tsx](../panel/SentThreadCard.tsx)
  and [SidebarEntry.tsx](../sidebar/SidebarEntry.tsx). Both views read these rows. Tree tests
  check the order; panel/sidebar tests check how it appears.
- **Add a `NodeReply` kind:** check [ReplyBlock.tsx](../../replies/ReplyBlock.tsx) and the
  marker function in `SidebarEntry.tsx`. If it comes from a new parsed-answer state, also
  update [reply-history.ts](../../replies/reply-history.ts) and `replyFor` in the tree builder.
