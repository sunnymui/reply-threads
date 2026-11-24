# Preparing a send

- `compose-prompt.ts`: builds the instruction, quoted comments, display label, prompt hash
  and tracking metadata. The same inputs produce the same text.
- `create-batch.ts`: builds a `submitting` record and prompt parts from the supplied IDs,
  pending comments and timestamp. It does not save or send them.

`../send-workflow.ts` saves this record and locks its threads before sending.

Hash the full instruction and comment body, even when they will be sent as separate messages.
Use labels from the actual batch in heading instructions and keep comments in their original order.

Tests cover prompt text, hashes, batch creation and the related storage changes.

## Related changes

- **Change label syntax or heading instructions:** check [compose-prompt.ts](compose-prompt.ts),
  [thread-labels.ts](../../threads/data/thread-labels.ts) and
  [reply-history.ts](../../replies/reply-history.ts). Labels are generated, sent and parsed
  in those three places. Run their tests together.
- **Add a batch tracking field:** check [create-batch.ts](create-batch.ts),
  [thread-types.ts](../../threads/data/thread-types.ts),
  [validate-repository.ts](../../threads/data/validate-repository.ts) and
  [reconcile-batch.ts](../recovery/reconcile-batch.ts). Recovery must be able to read any new
  identity or metadata used by sending.
- **Change instruction/body splitting:** check [submit-batch.ts](../submission/submit-batch.ts).
  The idle send splits them into two messages, but `create-batch.ts` must still hash the
  same complete text used by the queued send. Submission tests check that equality.
