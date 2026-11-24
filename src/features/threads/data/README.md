# Saved thread data

- `thread-types.ts`: fields for threads, batches, source matches and the repository, plus empty state.
- `thread-repository.ts`: changes a repository draft supplied by a storage update.
- `thread-labels.ts`: assigns session-local labels such as `1`, `1a` and `1a1`.
- `workflow-types.ts`: the shared type for the repository update function.
- `validate-repository.ts`: checks saved version-one JSON. It preserves unknown fields,
  defaults a missing legacy revision to zero and rejects unsupported versions or invalid types.

Call repository changes inside the host storage update. A send must record its batch and
lock its threads together, so both sets of update rules stay here.

Keep these functions independent of JSX and OpenCode APIs. The host storage code lives in
`../thread-storage.ts`. It validates a JSON copy because the host's live view contains symbol
metadata that is not part of saved JSON. The UI keeps using the original live view.

A missing revision gets a local default and is saved in the next transaction. Other invalid
data is reported, not repaired or replaced. Storage rules handle valid operations and thread
ownership; the JSON schema checks the data format.

Tests cover repository changes, labels, validation and serialized updates from multiple callers.

## Related changes

- **Add or rename a saved field/status:** update [thread-types.ts](thread-types.ts),
  [validate-repository.ts](validate-repository.ts) and [thread-repository.ts](thread-repository.ts).
  Also check [capture-thread.ts](../../annotate/capture/capture-thread.ts) or
  [create-batch.ts](../../send/preparation/create-batch.ts), depending on which record needs
  the value. Check old-file loading in [thread-storage.ts](../thread-storage.ts).
- **Change labels:** check [thread-labels.ts](thread-labels.ts), `parentLabelOf` in
  [compose-prompt.ts](../../send/preparation/compose-prompt.ts) and the heading matcher in
  [reply-history.ts](../../replies/reply-history.ts). All three interpret the label syntax.
- **Change a batch transition:** check [send-workflow.ts](../../send/send-workflow.ts) and
  [recover-batches.ts](../../send/recovery/recover-batches.ts). Sending and recovery use the
  same repository operations. Keep the batch-claim/concurrent-update tests passing.
