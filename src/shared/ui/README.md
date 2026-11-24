# Shared UI components

- `ActionButton.tsx`: styled button used by the annotation editor and thread cards.
- `Divider.tsx`: separates the quote from the comment input.
- `QuoteBlock.tsx`: draws a quote preview with an accent border.
- `colors.ts`: shared colors for these components and feature UI.

Name each component file after its exported component. Keep controls used by only one
feature, such as the composer's `ToolbarButton`, in that feature.

These components draw content and call the actions passed to them. Saving comments and
sending prompts stay in feature code. Text formatting helpers can come from `shared/text`.

## Related changes

- **Change button mouse handling:** check [AnnotationEditor.tsx](../../features/annotate/editor/AnnotationEditor.tsx),
  [PendingThreadCard.tsx](../../features/threads/panel/PendingThreadCard.tsx) and
  [ReplyBlock.tsx](../../features/replies/ReplyBlock.tsx). Clicks must not bubble into an
  answer's expand action or steal input focus. Run panel/editor tests and live smoke.
- **Change quote props, limits or layout:** check `QuoteBlock.tsx`, both thread-card components
  and `AnnotationEditor.tsx`. Editor/card callers use different preview limits; the original
  text still needs to be saved and sent in full.
- **Rename a shared color:** check `colors.ts`, the annotation editor, thread panel/sidebar,
  reply block and [SidebarRow.tsx](../../features/threads/sidebar/SidebarRow.tsx). Those files
  import the color groups directly.
