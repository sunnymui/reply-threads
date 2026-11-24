# Comment input

- `AnnotationEditor.tsx`: draws the quote and input, fills in existing comments and restores focus.
- `annotation-keys.ts`: handles save, new line and cancel keys.

The workflow supplies the quote, initial comment and actions. The editor handles typing and
drawing; saving data and assigning labels stay in the workflow and thread code.

Reply Mode selection, Reply buttons, `/thread` and E to edit all use this input:

- Enter or **Save reply** saves, Ctrl+J adds a line, and Esc cancels.
- Cancel discards the input and leaves the panel open. Cancelling an edit keeps the saved comment.
- Saving changes only the text of an existing pending comment.
- The input stays mounted while saving and after a failure, so a retry keeps the typed text.
- The state machine blocks duplicate saves and supplies the Saving label.

## Focus and Enter

The editor gives its textarea to the workflow when it mounts and clears that reference when
it unmounts. The workflow registers Enter from the app slot, targeting that textarea.
OpenCode handles Enter before textarea callbacks, so the callback alone is not enough.

Keep that binding outside the panel. A panel-owned binding accepted the first save but
stopped working on the next annotation after focus returned to the prompt.

Do not claim host panel focus from the editor. Clear focus timers on unmount so an old input
cannot take focus from a newer one.

`AnnotationEditor.test.tsx` covers prefilled multiline input. Workflow and panel tests cover
saving, cancellation, focus, pending edits and keeping text after a failure.

## Related changes

- **Add an input control or state:** check [AnnotationEditor.tsx](AnnotationEditor.tsx),
  [annotation-workflow.tsx](../annotation-workflow.tsx),
  [TuiPlugin.tsx](../../../app/TuiPlugin.tsx) and
  [ThreadPanel.tsx](../../threads/panel/ThreadPanel.tsx). A new prop needs to be passed through
  the app and panel, and save/cancel behavior needs workflow and panel tests.
- **Change keyboard handling:** check [annotation-keys.ts](annotation-keys.ts) and
  `registerEditorKeys` in the workflow. They handle textarea events and OpenCode's earlier
  key dispatch respectively. Update the input hint and main README when shortcuts change.
- **Change click or focus behavior:** check [ActionButton.tsx](../../../shared/ui/ActionButton.tsx)
  and [panel-focus.ts](../../../opencode-helpers/panel-focus.ts). Button event handling and
  delayed focus release affect whether the next click or selection works. Run the live smoke.
