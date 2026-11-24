# Writing comments

This feature turns selected text or a Reply-button click into a saved comment. It also edits
existing pending comments in the same right-hand input.

- `annotation-workflow.tsx`: connects selection, editing, saving, Reply Mode and OpenCode focus.
- `annotation-state.tsx`: keeps the editor in `idle`, `editing` or `saving` with one draft.
- [Capture](capture/README.md): reads selected text, finds its source and creates a thread.
- [Editor](editor/README.md): draws the input and handles typing, save and cancel keys.

The workflow uses thread storage, reply matching and the shared history/focus helpers. The
app supplies the current-session function and a way to clear the panel's scroll target.

## Keep the draft together

Each draft holds its ID, session, quote, initial comment and optional parent or pending-thread
ID. `saveComment` takes only the typed text. It gets the rest from that draft.

Saving blocks duplicate submissions and checks the draft again before writing. Cancel and
session changes invalidate it. An old success or failure cannot close a newer editor. A save
failure returns to editing and leaves the typed text in place.

## OpenCode workarounds

Register Enter from the mounted app slot and target the active textarea. OpenCode handles
Enter before the textarea callback. Panel-owned key bindings also stop working after focus
returns to the prompt. The editor should not claim host panel focus.

Keep the workflow and state files as `.tsx` on beta-19271. Moving Solid state into a `.ts`
file made the toast say Reply Mode was on while the toolbar and selection code still saw it
as off. The live TUI exposed this problem; the component tests did not.

Preserve the original quote, including complete answers quoted by Reply buttons. That text
keeps the follow-up understandable after chat compaction.

Tests sit beside the code. They cover source matching, selection, editing, duplicate saves,
cancelled/replaced drafts, session changes during a save, unload and retry after failure.

## Related changes

- **Add an editing state or draft field:** change [annotation-state.tsx](annotation-state.tsx)
  and check [annotation-workflow.tsx](annotation-workflow.tsx). If the input needs the value,
  pass it through [TuiPlugin.tsx](../../app/TuiPlugin.tsx) and
  [ThreadPanel.tsx](../threads/panel/ThreadPanel.tsx). Add the transition case to workflow tests.
- **Save a new piece of comment data:** check [capture-thread.ts](capture/capture-thread.ts),
  [thread-types.ts](../threads/data/thread-types.ts),
  [thread-repository.ts](../threads/data/thread-repository.ts) and
  [validate-repository.ts](../threads/data/validate-repository.ts). The draft field alone does
  not add it to saved records.
- **Change when Enter sends pending comments:** check `enterSends` in the workflow,
  [commands.ts](../../app/commands.ts) and [ComposerToolbar.tsx](../composer/ComposerToolbar.tsx).
  The binding, save notification and visible hint should describe the same behavior.
