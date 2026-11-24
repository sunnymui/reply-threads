# Sending comments

This feature builds a prompt from pending comments, sends it and checks interrupted sends.
A batch is the group of comments sent together.

- `send-workflow.ts`: actions called by the app, a duplicate-send guard and automatic recovery.
- [Preparation](preparation/README.md): builds prompt text, IDs, hashes and the batch record.
- [Submission](submission/README.md): calls OpenCode to send the batch.
- [Recovery](recovery/README.md): checks whether OpenCode received an interrupted send.

Thread types and storage rules come from `features/threads`. OpenCode calls used only for
sending stay here. Tests sit beside the code.

## Sending rules

- Save the batch record and lock its threads before making the send request.
- When idle, send the hidden instruction label and visible comments using `steer`.
- When busy, queue one message containing both the instruction and comments.
- Hash the complete prompt in both modes so recovery can identify the same send.
- If the result is unknown, keep the threads locked and check history before retrying.
- Cancel a leftover label only after a definite rejection or proof that the prompt is absent.

## Related changes

- **Add a batch or thread status:** check [thread-types.ts](../threads/data/thread-types.ts),
  [validate-repository.ts](../threads/data/validate-repository.ts),
  [thread-repository.ts](../threads/data/thread-repository.ts), the send workflow and recovery.
  Saved-data checks, thread locks and recovery must agree on the new state.
- **Change the prompt format:** check [compose-prompt.ts](preparation/compose-prompt.ts),
  [submit-batch.ts](submission/submit-batch.ts) and [reply-history.ts](../replies/reply-history.ts).
  The complete prompt hash must stay consistent across send forms, and the model's requested
  heading format must remain readable by the answer parser.
- **Add a send command or button:** check [commands.ts](../../app/commands.ts),
  [TuiPlugin.tsx](../../app/TuiPlugin.tsx) and [ComposerToolbar.tsx](../composer/ComposerToolbar.tsx).
  They connect the feature action to keyboard and mouse entry points.
