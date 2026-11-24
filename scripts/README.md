# Development scripts

- `run-tests.mjs`: discovers colocated logic/UI tests under `src/` and selects Node or Bun.
- `smoke-opencode.mjs`: Node entrypoint for the live feature smoke suite.
- `smoke-opencode.py`: one isolated server/TUI, fixture history and condition-driven PTY checks.
- `oxlint-plugin.mjs`: project-specific Oxlint rules for known host constraints and naming.
- `oxlint-plugin.test.mjs`: valid/invalid rule fixtures using Oxlint's own RuleTester.
- `jsdoc-rules.test.mjs`: checks the configured JSDoc requirements against valid/incomplete
  exported functions, including arrow functions, stale parameter names and void returns.

## Custom lint rules

- `reply-threads/annotation-enter-scope`: rejects static Enter bindings inside keymap layers
  in annotation-editor or thread-panel files. Those files inherit the panel input scope,
  which becomes inactive after save returns focus left. Register editor keys from the app
  slot instead. Escape/navigation bindings remain valid inside the panel.
- `reply-threads/reactive-module-extension`: requires `.tsx` for runtime source that directly
  creates Solid signals, memos or stores. This preserves the beta-19271 loader workaround.
  It follows named-import aliases and namespace imports; tests are exempt.
- `reply-threads/component-filename`: requires exported PascalCase functions in runtime
  `.tsx` files to match their filenames, including arrow-function components.
- `reply-threads/message-pagination-options`: rejects explicit `cursor` and `order`
  properties together in message-list requests. Cursor/order collisions cause HTTP 400 and
  previously forced history loading to fall back to the recent cache.
- `reply-threads/setup-keymap-scope`: rejects keymap registration directly in `Plugin.define`
  setup, including immediate function invocations and imported `Plugin` aliases. Deferred
  slot/component callbacks remain allowed. This guards the pinned runtime's missing-provider bug.
- `reply-threads/review-history-source`: blocks `cachedHistory` imports/namespace access and
  direct host message-cache access in panel, sidebar and reply-card code. `createReviewHistory`
  owns the complete-history boundary; status helpers remain allowed.
- `reply-threads/no-adjacent-jsdoc`: catches neighboring JSDoc blocks separated only by
  whitespace. A distinct overview must be tagged `@file`, `@fileoverview` or `@module`.
- `reply-threads/informative-function-docs`: rejects function/parameter/return descriptions
  that only repeat their names. It uses `comment-parser` and `are-docs-informative`, the same
  parsing/scoring libraries used by upstream `informative-docs`, with explicit function
  visitors. The upstream visitor did not report negative fixtures through Oxlint 1.88's
  JS-plugin bridge. Fixtures cover declarations, arrow exports and parameter descriptions.

These checks cover static patterns, not all possible ways to create a broken input scope or
reactive module. Keep the real-TUI regression checks. Add valid and invalid fixtures whenever
a rule changes; avoid autofixes for moves or lifecycle changes that need runtime verification.

`npm run test:lint` runs these fixtures through Oxlint's RuleTester; `npm run lint` uses the
actual plugin configuration with native type-aware rules and Solid reactivity checks. The
Solid plugin runs only against runtime code. Test registrations from `node:test` are marked
as known-safe promise calls without disabling unhandled-promise checks for other test code.

JSDoc requirements use `eslint-plugin-jsdoc` through Oxlint's JS-plugin API under the
`jsdoc-full` alias, since native Oxlint rules do not cover missing export comments and
descriptions. The configuration requires export comments, descriptions, named/described
parameters and described returns. Types remain in TypeScript. Tests and development scripts
are exempt from documentation requirements. Fixers for missing comments/params are disabled
so lint cannot fill the project with placeholder prose.

`typescript/switch-exhaustiveness-check` requires every union case, even when a default
branch exists. Reply-status rendering explicitly lists text-bearing cases instead of using
a default that could hide a newly added state. Informative-doc checks identify simple name
repetition; they cannot assess whether a description is accurate or useful.

## Fast live smoke

On macOS/Linux, install Python 3 and the small terminal parser dependency once:

```sh
python3 -m pip install -r scripts/smoke-requirements.txt
npm run test:smoke
```

The CLI is resolved from PATH. If necessary, set `OPENCODE_BIN=/path/to/opencode2` or
`PYTHON=/path/to/python3`. `OPENCODE_SMOKE_DIR` chooses the parent directory for temporary
homes. No user configs/state are changed. Fixtures are inserted only into the throwaway
server's database before the TUI attaches; the suite submits annotations, not model prompts.

Checks cover two consecutive Enter saves, empty/typed Cancel, prefilled editing, and targeted
discard while preserving a sent answer behind 120 newer messages, then restart the TUI with
an unsupported saved-data version to check reporting and preservation. Screen conditions,
input focus and quiet frame boundaries replace fixed startup sleeps. The suite passed in 4.9s on
the tested machine; runtime depends on host startup and rendering speed.

Failure keeps `screen.txt`, `terminal.log`, server logs and the isolated repository in the
reported temporary directory. `npm run test:smoke -- --keep-artifacts` also keeps successful
runs. Child process groups are stopped on exit. `npm run check` remains the portable lint,
typecheck and unit/UI suite; run the live smoke separately where the pinned CLI is available.
