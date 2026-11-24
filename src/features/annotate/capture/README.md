# Capturing selected text

- `selection.ts`: remembers selected text before OpenCode clears it. It can pause capture,
  clear a session's selection and remove its listener when the plugin unloads.
- `quote-attribution.ts`: finds the source message for a quote and reports `exact`,
  `ambiguous` or `unmatched`.
- `capture-thread.ts`: finds the source, assigns a label and adds the comment to a repository
  draft. The caller saves that draft through a storage update.

`../annotation-workflow.tsx` connects these steps to the editor, finds any parent comment
and handles persistence.

Keep the original quote unchanged. Mouse coordinates help capture text but are not a saved
message ID. Allocate the label and insert the thread in the same storage update so two
instances cannot claim the same label.

Tests cover source matching and selection handling, including OpenCode clearing a selection.

## Related changes

- **Change quote matching:** check [quote-attribution.ts](quote-attribution.ts),
  [normalize-for-match.ts](../../../shared/text/normalize-for-match.ts) and
  [parent-resolution.ts](../../replies/parent-resolution.ts). The same normalization affects
  both source matching and follow-up matching. Run attribution and reply-history tests.
- **Capture a new saved field:** update [capture-thread.ts](capture-thread.ts), then check
  [thread-types.ts](../../threads/data/thread-types.ts),
  [thread-repository.ts](../../threads/data/thread-repository.ts) and
  [validate-repository.ts](../../threads/data/validate-repository.ts) so creation and loading agree.
- **Change selection pause or cleanup:** check [selection.ts](selection.ts) and
  [annotation-workflow.tsx](../annotation-workflow.tsx). The workflow pauses capture while
  editing and resumes it on cancel/save. Selection tests and live smoke cover repeated captures.
