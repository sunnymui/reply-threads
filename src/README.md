# Working on Reply Threads

This is the developer guide. For installation and usage, read the [main README](../README.md).

## Where the plugin starts

OpenCode loads server plugins and terminal UI (TUI) plugins separately:

| File | What it does |
| --- | --- |
| `app/ServerPlugin.ts` | Exports the empty server plugin that OpenCode expects when loading this package. |
| `app/TuiPlugin.tsx` | Loads saved data, connects the features, adds UI components and handles cleanup. |
| `app/commands.ts` | Connects keyboard, palette and slash commands to feature actions. |

`package.json` points `.` to `app/ServerPlugin.ts` and `./tui` to `app/TuiPlugin.tsx`.
The package-root files `index.ts`, `tui.ts` and `tui.tsx` forward to those files for
local-directory loading.

Keep the empty server plugin. The server loader requires a valid plugin export even though
Reply Threads does its work in the TUI.

## Find the feature you need

Each feature contains its code, components and tests. Larger features have subfolders for
related tasks. Read the README in the area you are changing before editing it.

| Folder | What belongs here |
| --- | --- |
| [App](app/README.md) | Plugin startup, commands, UI placement and cleanup. |
| [Composer](features/composer/README.md) | Toolbar buttons, pending previews and hover hints. |
| [Annotate](features/annotate/README.md) | Selecting text, editing comments and saving drafts. |
| [Threads](features/threads/README.md) | Saved thread data, labels, storage rules, panel and sidebar. |
| [Replies](features/replies/README.md) | Reading model answers and finding which comment they answer. |
| [Send](features/send/README.md) | Building prompts, sending comments and checking interrupted sends. |
| [OpenCode helpers](opencode-helpers/README.md) | History and focus code used by several features. |
| [Shared](shared/README.md) | Small UI components and text helpers used by several features. |

```text
src/
  app/
    ServerPlugin.ts
    TuiPlugin.tsx
    commands.ts
  features/
    composer/
      ComposerToolbar.tsx
      ToolbarButton.tsx
    annotate/
      annotation-workflow.tsx
      annotation-state.tsx
      capture/                     # select text, find its source, create a thread
      editor/                      # comment input and keyboard handling
    threads/
      thread-actions.ts
      thread-storage.ts
      data/                        # types, labels, saved-data checks and update rules
      review/                      # build the conversation tree for both views
      panel/                       # full thread panel and comment cards
      sidebar/                     # compact list in OpenCode's sidebar
    replies/
      reply-history.ts
      review-history.tsx
      parent-resolution.ts
      ReplyBlock.tsx
    send/
      send-workflow.ts
      preparation/                 # prompt text and batch records
      submission/                  # send requests to OpenCode
      recovery/                    # check whether an interrupted send arrived
  opencode-helpers/
    message-history.ts
    panel-focus.ts
  shared/
    ui/                            # buttons, quote blocks, dividers and colors
    text/                          # shorten display text and compare quotes
```

## Keep changes in the right place

- Name component files after their exports: `ThreadPanel` belongs in `ThreadPanel.tsx`.
- Name other files after their task, such as `capture-thread.ts` or `compose-prompt.ts`.
- Keep tests beside the code they test.
- Keep feature behavior in `features`. The app connects those features to OpenCode.
- Keep OpenCode calls in the feature that uses them. Move a helper to `opencode-helpers`
  when several features need it.
- Keep data calculations separate from JSX and OpenCode APIs so they are easy to test.
- Use the thread types from `features/threads/data`; don't define copies in `shared`.
- Change a batch record and its thread locks in the same storage update. A batch is the group
  of comments sent together.
- Keep saved-data formats and IDs unchanged when moving files.
- Follow [AGENTS.md](../AGENTS.md) and the README in each relevant parent folder.

For example, a prompt-delivery change belongs in `features/send`. Matching a selected quote
to an earlier answer belongs in `features/replies`. Drawing that answer belongs in `ReplyBlock.tsx`.

## State and saved data

The annotation editor has three states: `idle`, `editing` and `saving`. One draft holds its
session, quote, initial text and optional parent or edited-thread ID. Reply Mode is separate.
Cancelling or switching sessions invalidates that draft, so an old save cannot close a new editor.

Saved threads keep the original quote, comment, session, label, parent and status. Quote
matching reports `exact`, `ambiguous` or `unmatched`. It never changes the original text or
chooses a parent when several answers match.

Model answers are read from OpenCode history rather than copied into the saved repository.
A batch's answer runs from its user prompt to the next user or synthetic message and may
contain several assistant messages. Reply buttons quote the complete answer to preserve
context if OpenCode compacts the chat.

The storage loader checks saved JSON before the features use it. Unsupported versions or
invalid fields are reported without replacing the file. Every write is checked before and
after the requested change.

Before sending, the plugin saves the batch IDs, prompt hash and thread locks. Rejected sends
restore pending comments. Uncertain sends stay locked until recovery checks the history.
Recovery runs for the active session or through `/threads-reconcile`. Tests cover serialized
updates; simultaneous writes from two live TUI instances have not been verified.

## Dependencies and OpenCode compatibility

`@opencode/plugin` is a production dependency for `Plugin.define(...)`. Zod checks saved data.
OpenTUI and Solid are provided by OpenCode and installed locally for development and tests.
Keep the tested SDK/runtime versions until a newer combination has been checked.

On beta-19271, register commands from the mounted `app` slot. Register annotation Enter keys
there too, targeting the current textarea. Keep modules that create Solid state as `.tsx`;
moving them to `.ts` broke updates in the live TUI. The local READMEs and
[compatibility notes](../docs/compatibility.md) explain these workarounds.

Use supported OpenCode APIs. Don't inspect private renderer trees or edit chat messages directly.

## Run the checks

```sh
npm install
npm run check        # lint, typecheck, lint-rule tests, logic tests and UI tests
npm run lint         # Oxlint, TypeScript promise checks and Solid reactivity checks
npm run lint:fix     # apply available safe lint fixes
npm run test:lint    # test our lint rules with valid and invalid examples
npm test             # logic tests: *.test.ts under src/
npm run test:ui      # UI tests: *.test.tsx under src/, using Bun and the Solid preload
npm run test:smoke   # key feature checks in an isolated live OpenCode TUI
```

`scripts/run-tests.mjs` finds tests recursively. TypeScript checks test files too. UI tests
can combine features, such as the thread panel and annotation editor.

The live smoke suite uses Python 3 and pyte on macOS/Linux. It finds `opencode` on PATH or
through `OPENCODE_BIN`. It uses fixture messages instead of model calls and waits for screen
conditions instead of long sleeps. Run it separately from `npm run check`. See
[scripts/README.md](../scripts/README.md) for setup and failure logs.

## Lint and JSDoc

`.oxlintrc.json` configures Oxlint. It checks source files, root entrypoints and scripts.
Typechecking remains a separate step. Tool versions are pinned because Oxlint's JS-plugin
support is still alpha.

Our rules check keymap placement, `.tsx` state modules, component filenames, message
pagination, complete history in review UI and duplicate JSDoc blocks. Switches must handle
every union case, even when they have a default branch. See
[scripts/README.md](../scripts/README.md) for the rules and their tests.

Exported runtime functions need JSDoc with a description, named/described parameters and
described returns, including void returns. Private helpers only need comments when useful,
but existing JSDoc is checked. Don't repeat TypeScript types or add empty boilerplate.
Descriptions that only repeat a function or parameter name fail lint.

Test files skip documentation and Solid reactivity rules because tests deliberately read
snapshots and run async callbacks. `node:test` owns test-registration promises; other
unhandled promises still fail lint. `trackCommentSelection` is configured to allow its
callbacks to read current Solid values.

Lint cannot verify host focus or terminal behavior. Keep the live smoke checks.

## Related changes

When adding a feature, follow its data and actions through the other files that use them:

- **Add a saved field:** check [thread-types.ts](features/threads/data/thread-types.ts),
  [validate-repository.ts](features/threads/data/validate-repository.ts) and
  [thread-repository.ts](features/threads/data/thread-repository.ts). A TypeScript field also
  needs a saved-data check and a value when records are created. Check the prompt or cards if
  the field should be sent or displayed.
- **Add an editor action:** check [annotation-workflow.tsx](features/annotate/annotation-workflow.tsx),
  [TuiPlugin.tsx](app/TuiPlugin.tsx), [ThreadPanel.tsx](features/threads/panel/ThreadPanel.tsx)
  and [AnnotationEditor.tsx](features/annotate/editor/AnnotationEditor.tsx). The action and its
  state must reach the input through the app and panel props.
- **Change comment labels or model headings:** check [thread-labels.ts](features/threads/data/thread-labels.ts),
  [compose-prompt.ts](features/send/preparation/compose-prompt.ts) and
  [reply-history.ts](features/replies/reply-history.ts). The label allocator, requested
  headings and answer parser must agree.
- **Change conversation order or answer states:** check [thread-tree.ts](features/threads/review/thread-tree.ts),
  [ReplyBlock.tsx](features/replies/ReplyBlock.tsx) and
  [SidebarEntry.tsx](features/threads/sidebar/SidebarEntry.tsx). The panel and sidebar share
  the tree but draw answer states differently.

The local READMEs give more specific examples and point to tests for each change.

## More detail

- [Architecture](../docs/architecture.md): how the features work together.
- [Compatibility](../docs/compatibility.md): tested OpenCode behavior and workarounds.
- [Original plan](../docs/implementation-plan.md): early design and implementation history.
