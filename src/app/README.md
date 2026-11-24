# Plugin startup and wiring

This folder connects the features to OpenCode. Put comment editing, sending and thread rules
in their feature folders.

- `ServerPlugin.ts`: the empty server plugin required when OpenCode loads the package.
- `TuiPlugin.tsx`: loads saved data, creates the feature workflows, adds UI components and
  stops listeners when the plugin unloads.
- `commands.ts`: defines keyboard, palette and slash commands and calls the supplied actions.

The package exports point directly to the two plugin files. The root `index.ts`, `tui.ts`
and `tui.tsx` files forward to them for local-directory loading.

## Follow TuiPlugin.tsx

The numbered sections run in this order:

1. Load and check saved threads. Create `focusedThreadID` to remember which card to scroll to.
2. Create `annotationWorkflow`, `sendWorkflow` and `threadActions`.
3. Register four OpenCode slots: app commands, the prompt toolbar, the full panel and the
   sidebar summary. A slot is a named place where a plugin can add UI.
4. Start checking unfinished sends, then check again on OpenCode data events.
5. Return cleanup that removes the slots and stops the listeners.

`opencode` is the API object supplied by OpenCode. `sharedFeatureInputs` passes it, the
repository writer and `getCurrentSessionID` to the workflows. Passing the session function
lets actions read the current session when they run.

A sidebar click calls `openThreadsPanel(threadID)`. That sets the scroll target and opens
the panel. Saving calls `annotationWorkflow.saveComment` with the typed text; its draft
already holds the quote, session and parent or edited-thread ID.

## Host details that matter

On beta-19271, register keymap layers from the mounted `app` slot. Registering them directly
in plugin setup fails because the keymap provider is missing there.

The app slot also calls `annotationWorkflow.registerEditorKeys()`. The workflow defines the
Enter action, and the app gives it a place to run outside the panel's input scope. It targets
the currently mounted textarea. Otherwise Enter stops saving after the first annotation
returns focus to the prompt.

Watch a memoized session ID for route changes. Changing other route details should not reset
an open editor. Switching to another session clears the draft and Reply Mode.

Repository loading is synchronous. Invalid saved data shows an error and stops feature
setup without resetting the file. The toolbar belongs to `features/composer`; the app only
places it above the prompt and supplies its actions.

## Related changes

- **Add a command or shortcut:** define its action in the feature, add it to
  [commands.ts](commands.ts), then pass the action from [TuiPlugin.tsx](TuiPlugin.tsx).
  Update [ComposerToolbar.tsx](../features/composer/ComposerToolbar.tsx) if it shows that shortcut.
- **Add editor state or a callback:** check the annotation workflow, the props passed in
  `TuiPlugin.tsx`, [ThreadPanel.tsx](../features/threads/panel/ThreadPanel.tsx) and
  [AnnotationEditor.tsx](../features/annotate/editor/AnnotationEditor.tsx). Each step passes
  the value or action to the next; panel tests check the full path.
- **Move a plugin entry file:** update [package.json](../../package.json) and the root
  `index.ts`, `tui.ts` and `tui.tsx` forwarding files. Run the live smoke test to check that
  OpenCode still loads and draws the plugin.
