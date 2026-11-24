# Shared helpers and UI

Keep small pieces used by several features here:

- [UI](ui/README.md): buttons, quote blocks, dividers and colors.
- [Text](text/README.md): display text and quote-comparison helpers.

Thread types, editing/sending behavior, answer parsing and OpenCode calls belong in their
features. Keep feature-specific limits with the component that uses them. Text helpers
should work without an OpenCode context.

## Related changes

- **Change a shared control's props:** check its callers in the annotation editor, thread
  cards and reply block. [UI guidance](ui/README.md) names the main callers; panel/editor
  tests catch changes to clicks, focus and displayed quotes.
- **Change text comparison or clipping:** check the callers listed in the
  [text README](text/README.md). Comparison changes can affect follow-up linking, while
  display changes must leave saved and sent text intact.
