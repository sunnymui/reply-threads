# Prompt toolbar

This folder draws the controls above OpenCode's prompt.

- `ComposerToolbar.tsx`: Reply Mode, Send, pending-comment previews and shortcut/hover hints.
- `ToolbarButton.tsx`: button styling used only by this toolbar.
- `ComposerToolbar.test.tsx`: drawing, clicks, hover and hint behavior.

The app places the toolbar in `session.composer.top` and supplies its annotation/send actions.
The toolbar reads pending comments from the repository; the workflows handle editing and sending.

Keep selection instructions in the Reply Mode hover hint. The text beside the buttons shows
shortcuts and, when Reply Mode has pending comments, the Enter-to-send hint.

Reserve the hover-hint row even when it is empty so hovering does not move the prompt or chat.
Keep `ToolbarButton` here while only this toolbar uses it. Controls used by several features
belong in `shared/ui`.

## Related changes

- **Add a toolbar action:** check [ComposerToolbar.tsx](ComposerToolbar.tsx),
  [TuiPlugin.tsx](../../app/TuiPlugin.tsx) and the feature that implements the action. The app
  supplies toolbar callbacks. If it also needs a shortcut, add that in
  [commands.ts](../../app/commands.ts).
- **Change the Enter hint:** check `enterSends` and the save notification in
  [annotation-workflow.tsx](../annotate/annotation-workflow.tsx), plus the Enter binding in
  `commands.ts`. Keep the text consistent with when sending is actually allowed.
- **Change what counts as pending:** check [thread-repository.ts](../threads/data/thread-repository.ts)
  and [ThreadPanel.tsx](../threads/panel/ThreadPanel.tsx). Toolbar previews/counts and the
  panel's Pending section should agree. Composer and panel tests cover both views.
