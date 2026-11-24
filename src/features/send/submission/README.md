# Sending a prepared batch

`submit-batch.ts` sends a batch that the workflow has already saved.

- **Idle session:** send a synthetic instruction with `resume: false`, then the visible
  comments. Both messages use `steer`. The synthetic message shows a short label in chat.
- **Busy session:** queue one complete prompt.
- **Label request fails:** try to cancel the label and fall back to one queued prompt.

The workflow decides when the two-message form is allowed. Using `queue` for those two
messages started a separate turn and left the comments waiting behind it on beta-19271.

This file also cancels leftover labels. Cancellation can safely fail if a label was never
created or was already consumed. Don't cancel a label when the prompt's result is unknown;
recovery must check whether the prompt arrived first.

Prompt errors go back to the send workflow, which updates saved state and reports the result.
Tests cover both send forms, fallback, cancellation and recovery.

## Related changes

- **Change delivery modes:** check [submit-batch.ts](submit-batch.ts) and the idle-session
  check in [send-workflow.ts](../send-workflow.ts). The workflow decides which form is safe;
  submission chooses its API options. Keep both send forms covered in submission tests.
- **Change message IDs or metadata:** check [create-batch.ts](../preparation/create-batch.ts),
  [compose-prompt.ts](../preparation/compose-prompt.ts), `send-workflow.ts` and
  [reconcile-batch.ts](../recovery/reconcile-batch.ts). Planning, sending and recovery must
  refer to the same prompt and label IDs.
- **Change error or label cleanup behavior:** check `send-workflow.ts` and
  [recover-batches.ts](../recovery/recover-batches.ts). Both can cancel labels, but only after
  definite rejection or proof that a prompt is absent. Test uncertain results too.
