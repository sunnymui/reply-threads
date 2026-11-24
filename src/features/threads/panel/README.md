# Full thread panel

- `ThreadPanel.tsx`: reads session data and draws the header, editor, Pending cards, Sent
  conversations and footer. It also formats headings shared by both card types.
- `PendingThreadCard.tsx`: draws a quote, comment, status/selection markers and Discard button.
  Sending comments have no Discard button.
- `SentThreadCard.tsx`: draws an indented comment, its answer, highlight and Reply button.
- `pending-thread-actions.ts`: opens the selected pending comment for editing and handles
  confirmed deletion. A Discard click targets its own card, not the keyboard selection.
- `panel-navigation.tsx`: selects pending cards, expands answers, scrolls to a selected
  comment and connects keyboard shortcuts to the actions.
- `panel-id.ts`: the stable panel name used by app commands and the annotation workflow.
- `ThreadPanel.test.tsx`: tests the panel with the annotation and reply components.

The app adds this panel to `session.panel` and supplies its workflow actions. Use the editor
from `annotate`, answer components from `replies`, the tree from `../review` and storage
rules from `../data`. Shared buttons and quote blocks belong in `shared/ui`.

## Keyboard and focus

Create navigation while the panel is mounted so its key bindings share the panel's lifetime.
Pass functions that read current threads, rows and editor state rather than startup values.
Keep `panel-navigation.tsx` as `.tsx`; the annotation README explains the host's `.ts` issue.

Disable E, D and arrow shortcuts while annotating so they do not steal typing or caret keys.
Escape cancels an open annotation. Hide cancels it and closes the panel.

When opening at a comment, wait for the expanded card to finish layout, then put its top at
the panel's top. `scrollChildIntoView` cannot do this for a card taller than the visible area.
Use `threadRowID` for the matching card and scroll target.

## History

Use `createReviewHistory` to read answers. The host's recent-message cache alone can omit
older answers. Discarding a pending comment must not make those answers disappear or change
sent records. Panel tests cover that case, including a cache that drops older messages.

## Related changes

- **Add a pending-card button:** check [PendingThreadCard.tsx](PendingThreadCard.tsx),
  [pending-thread-actions.ts](pending-thread-actions.ts) and
  [panel-navigation.tsx](panel-navigation.tsx) if it also needs a shortcut. The card must pass
  its own thread to the action; test with a different keyboard-selected card.
- **Add an editor prop or action:** check [ThreadPanel.tsx](ThreadPanel.tsx),
  [TuiPlugin.tsx](../../../app/TuiPlugin.tsx),
  [AnnotationEditor.tsx](../../annotate/editor/AnnotationEditor.tsx) and
  [annotation-workflow.tsx](../../annotate/annotation-workflow.tsx). The value/action passes
  through that chain. Panel tests should exercise it with the actual workflow.
- **Change card IDs, nesting or scroll layout:** check [SentThreadCard.tsx](SentThreadCard.tsx),
  `threadRowID` in `panel-navigation.tsx` and [thread-tree.ts](../review/thread-tree.ts).
  Sidebar clicks depend on those IDs to open and scroll to the right card. Keep the focused-card test.
