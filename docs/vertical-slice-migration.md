# Vertical-slice migration

Structural refactor: preserve commands, storage shape, prompt format and UI behavior.
Threads own the core model; each other feature owns its use cases, host calls and tests.

## Tasks

- [x] Consolidate both plugin entry implementations in `app` and update package exports/root shims.
- [x] Inventory source, tests, entrypoints and existing uncommitted work.
- [x] Move the thread model, repository operations, labels and review UI into `features/threads`.
- [x] Move selection capture, attribution and annotation editors into `features/annotate`.
- [x] Move reply parsing, parent resolution and answer presentation into `features/replies`.
- [x] Move prompt composition, submission, reconciliation and recovery into `features/send`.
- [x] Move composer toolbar, its private button and tests into `features/composer`; keep `app` composition-only.
- [x] Extract feature workflows from the composition root and command registration into `app`.
- [x] Separate shared UI components/tokens from pure text helpers in `shared/ui` and `shared/text`.
- [x] Place shared presentation primitives in `shared` and host history/focus access in `opencode-helpers`.
- [x] Colocate existing tests with the feature they exercise; update test discovery and TypeScript coverage.
- [x] Add local feature READMEs and update source and architecture documentation.
- [x] Group larger features into purpose-named subdirectories, keep tests colocated, and
  rename the stored-data contracts to `threads/data/thread-types.ts`.
- [x] Verify source logic was preserved, all tests are discovered, typecheck and tests pass, and the real TUI loads.

## Naming and boundaries

- PascalCase files export the component with that name.
- Lowercase descriptive filenames describe use cases or data contracts.
- No generic `utils`, `controller` or `adapters` directories inside features.
- Feature-specific OpenCode interactions stay with their feature.
- Shared modules contain only genuinely cross-feature code.
- Public exports `.` and `./tui` target `app/ServerPlugin.ts` and `app/TuiPlugin.tsx`; root shims forward directly to them.

## Validation record

- `npm run check`: typecheck, 73 Node tests across 11 files, and 36 UI tests across 6 files pass.
- All 17 original test files were retained; their non-import syntax matches the pre-migration snapshot.
- Fifteen unchanged core modules match the pre-migration non-import syntax. Other modules
  were intentionally split into feature workflows or components and checked by the existing
  tests and real-TUI integration flow.
- `npm run test:smoke`: isolated startup passes. `git diff --check` is clean.
- Real TUI: toolbar mounts; Ctrl+L opens/closes the panel; Ctrl+Y enables selection capture;
  multiline input saves; Ctrl+L cannot discard an open annotation; a second Enter sends;
  a derived answer has a Reply button that saves a child with its explicit parent and full quote.
- Host-dependent discovery: signal-owning annotation workflow must remain `.tsx` on
  beta-19271. A `.ts` extraction broke live reactivity despite passing component tests;
  keeping `.tsx` restored the integration flow. Recorded in the annotate README.
- Plugin IDs, public export names, storage schema, prompt format and command bindings remain stable.
