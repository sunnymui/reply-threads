# Checking interrupted sends

- `reconcile-batch.ts`: checks messages for the planned prompt ID, then for matching batch
  and prompt-hash metadata. It returns `sent` or `absent`.
- `reconcile-admission.ts`: loads user messages from OpenCode for that check. Synthetic labels
  do not count as proof that the actual prompt arrived.
- `recover-batches.ts`: updates stored thread/batch state and cancels a leftover label when
  the prompt is proven absent.

`../send-workflow.ts` runs recovery for the active session. Users can also run
`/threads-reconcile`.

If history cannot be read, the result stays uncertain. Keep the comments locked rather than
retrying a send that might already have arrived.

For pagination, send `order` on the first request and only `cursor` on later requests.
OpenCode rejects a request containing both.

Tests cover message matching, pagination, excluding labels and saved-state updates during recovery.

## Related changes

- **Add a recovery outcome:** check [reconcile-batch.ts](reconcile-batch.ts),
  [recover-batches.ts](recover-batches.ts), [send-workflow.ts](../send-workflow.ts) and
  [thread-repository.ts](../../threads/data/thread-repository.ts). The result must map to
  the right saved status, thread locks and user notification.
- **Change message pagination:** check [reconcile-admission.ts](reconcile-admission.ts) and
  [message-history.ts](../../../opencode-helpers/message-history.ts). Both call the same
  message API. Their pagination tests should continue to reject combined cursor/order requests.
- **Change when labels are cancelled:** check [submit-batch.ts](../submission/submit-batch.ts)
  and the failure handling in `send-workflow.ts`. Recovery and initial sending must agree on
  definite versus uncertain results.
