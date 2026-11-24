# Shared OpenCode helpers

Put OpenCode API code here when several features need it. Calls used only by annotation or
sending stay in those features.

- `message-history.ts`: loads all message pages, reads the live cache, extracts assistant
  text and checks whether a session is running. `readHistorySnapshot` reports whether the
  load was complete. `mergeHistory` adds live updates without dropping older messages.
- `message-history.test.ts`: tests pagination, partial reads and merging history.
- `panel-focus.ts`: dispatches `pane.focus.left` shortly after the editor closes. This
  avoids OpenCode's focus overlay swallowing the next click on the chat or toolbar.
- `panel-focus.test.ts`: tests delayed focus release and hosts where the command is unavailable.

Use the client and renderer supplied by OpenCode. Don't create an unauthenticated client,
inspect private renderer trees or change stored chat messages directly.

For message pagination, send `order` on the first page and only the returned `cursor` on
later pages. The cursor already records the order. Sending both causes HTTP 400; that error
previously forced a cache fallback and hid older answers that were still present.

## Related changes

- **Change projected message fields:** check [message-history.ts](message-history.ts),
  `HistoryMessage` in [reply-history.ts](../features/replies/reply-history.ts) and
  [review-history.tsx](../features/replies/review-history.tsx). Parsing and follow-up matching
  consume that shape; assistant-text extraction also feeds quote attribution.
- **Change pagination:** check [reconcile-admission.ts](../features/send/recovery/reconcile-admission.ts).
  Recovery has another caller of the message-list API. Run both helpers' pagination tests.
- **Change focus release:** check [panel-focus.ts](panel-focus.ts),
  [annotation-workflow.tsx](../features/annotate/annotation-workflow.tsx) and
  [AnnotationEditor.tsx](../features/annotate/editor/AnnotationEditor.tsx). Save/cancel release
  focus while the input has its own focus timer. Live smoke checks repeated typing and clicks.
