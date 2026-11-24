# OpenCode sidebar summary

- `SidebarEntry.tsx`: pending count, compact sent tree and Open threads button.
- `SidebarRow.tsx`: one indented row with a label, answer marker and comment preview.
- `SidebarEntry.test.tsx`: drawing, order, visibility changes and panel-opening actions.

Use the tree from `../review` so ordering matches the full panel. Show up to 10 sent rows.
A session with only pending comments still gets the count and Open threads button.

Clicking a row passes its thread ID to the app, which opens the panel at that card. Reserve
the hover-hint space so pointer movement does not shift the sidebar.

Wrap visibility in Solid's `Show`. The sidebar may mount before the first comment exists.
A one-time empty check would leave it hidden after a comment is saved. Tests cover adding
the first comment and removing the last.

Use complete review history with live updates for answer markers. The recent cache alone
can make an older answer appear missing.

## Related changes

- **Change what happens on a row click:** check [SidebarEntry.tsx](SidebarEntry.tsx),
  `openThreadsPanel` in [TuiPlugin.tsx](../../../app/TuiPlugin.tsx),
  [ThreadPanel.tsx](../panel/ThreadPanel.tsx) and [panel-navigation.tsx](../panel/panel-navigation.tsx).
  The thread ID travels through those files to highlight and scroll to a card. Test both
  the sidebar callback and the panel's focused-card behavior.
- **Add an answer marker:** check `NodeReply` in [thread-tree.ts](../review/thread-tree.ts)
  and [ReplyBlock.tsx](../../replies/ReplyBlock.tsx). The marker and full answer block should
  agree on what the status means.
- **Change row limits or hover text:** check [SidebarRow.tsx](SidebarRow.tsx) and sidebar
  tests for narrow widths and reserved hint rows. Update the main README if the visible row limit changes.
