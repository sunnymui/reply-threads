# Shared text helpers

- `display-text.ts`: collapses whitespace and shortens text for previews. These changes are
  for display only; do not save the shortened text over the original comment or quote.
- `normalize-for-match.ts`: removes terminal control codes and normalizes Unicode and
  whitespace before comparing quotes. Keep the original quote separately.

These helpers do not need Solid, OpenTUI or OpenCode APIs. Answer headings and prompt
formatting belong in their respective features.

## Related changes

- **Change quote normalization:** check [quote-attribution.ts](../../features/annotate/capture/quote-attribution.ts)
  and [parent-resolution.ts](../../features/replies/parent-resolution.ts). Both use
  `normalizeForMatch`, so a change can affect source matching and follow-up links. Run their tests.
- **Change whitespace flattening or clipping:** check [QuoteBlock.tsx](../ui/QuoteBlock.tsx),
  [ReplyBlock.tsx](../../features/replies/ReplyBlock.tsx) and
  [SidebarEntry.tsx](../../features/threads/sidebar/SidebarEntry.tsx). Quote length, collapsed
  answers and one-line sidebar previews depend on these helpers. Check narrow UI test frames.
