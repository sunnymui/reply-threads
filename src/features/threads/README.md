# Thread data and views

This feature defines saved threads and batches, the rules for changing them, and the panel
and sidebar that display them. Other features use these types rather than defining copies.

- [Data](data/README.md): types, labels, saved-data checks and storage update rules. Start
  with `data/thread-types.ts` for the fields and `data/thread-repository.ts` for changes.
- `thread-actions.ts`: confirms and clears pending comments.
- `thread-storage.ts`: checks saved data when loading and before/after writes. Invalid data
  is reported without replacing it.
- [Review](review/README.md): builds the conversation tree used by both views.
- [Panel](panel/README.md): the full thread panel, editor and answer cards.
- [Sidebar](sidebar/README.md): the compact list and Open threads button in OpenCode's sidebar.

## Rules to preserve

Change batch records and thread locks in the same storage update. Keep saved formats and
plugin/thread/command IDs unchanged when reorganizing files.

Sort conversations by their most recent send. Keep follow-ups oldest first within a
conversation. Comments sent together keep their label order.

The panel uses the annotation editor and model-answer components from their features.
Those features still handle editing and answer parsing. Shared UI controls belong in `shared/ui`.

Tests sit beside the files they test. Logic tests cover storage, labels, ordering and
serialized updates. UI tests cover the panel, sidebar and editor interactions.

## Related changes

- **Add a saved field:** update [thread-types.ts](data/thread-types.ts),
  [validate-repository.ts](data/validate-repository.ts) and the creation/update code in
  [thread-repository.ts](data/thread-repository.ts). Check [thread-storage.ts](thread-storage.ts)
  if old saved files need a default or conversion. Storage tests should include older data.
- **Add a pending-comment action:** check [PendingThreadCard.tsx](panel/PendingThreadCard.tsx),
  [pending-thread-actions.ts](panel/pending-thread-actions.ts) and
  [panel-navigation.tsx](panel/panel-navigation.tsx). Add storage rules here or an annotation
  workflow action as needed; buttons and shortcuts should call the same operation.
- **Change answer states or conversation order:** check [thread-tree.ts](review/thread-tree.ts),
  [ReplyBlock.tsx](../replies/ReplyBlock.tsx) and [SidebarEntry.tsx](sidebar/SidebarEntry.tsx).
  The panel and sidebar share the data but draw it differently, so check both sets of tests.
