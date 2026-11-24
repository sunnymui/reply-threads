# OpenCode 2 Compatibility Findings

## Selection lifecycle correction

The initial capture command read `renderer.getSelection()` too late: inspection of
CLI `beta-19271` shows ordinary keys clear transcript selection before command
dispatch. Clicking a control can also clear the selection. While comment mode is
active, the selection adapter now snapshots text synchronously from OpenTUI's
`selection` completion event, using the public EventEmitter `prependListener`
API before host handlers. It consumes the snapshot once and clears it on mode
exit, route/session changes, and disposal. Capture is paused during the comment
editor. No clipboard reads or transcript traversal are used.

Regression tests use the real OpenTUI renderer and mouse drags with simulated
host copy/clear handling, then Ctrl+Y or a capture-button click. Both paths preserve
the quote. This does not expose native terminal selections made outside OpenTUI
(for example, terminal-owned selection gestures).

This document records Phase 0 analysis performed against the locally installed OpenCode 2 preview. It distinguishes runtime/API facts from plugin-UI assumptions that still require an interactive probe.

## Tested Environment

| Item | Value |
| --- | --- |
| OpenCode CLI | `opencode2 v0.0.0-beta-19271` |
| Health endpoint | Healthy, same version |
| Platform | macOS arm64 |
| Public API evidence | Running server's `/openapi.json` |
| TUI evidence | V2 documentation, binary inspection, isolated config launch |

## Compatibility Matrix

| Capability | Evidence | Result | Design consequence |
| --- | --- | --- | --- |
| Prompt admission | Running OpenAPI operation `v2.session.prompt` at `POST /api/session/{sessionID}/prompt` | **Verified** | Use the host client operation corresponding to this endpoint. |
| Idempotent prompt ID | Request accepts optional `id` matching `^msg_`; response returns a durable inbox item | **Verified** | Generate and persist the user message ID before submission; retry the same ID rather than inventing a second prompt. |
| Delivery mode | `Session.Inbox.Delivery` is `steer` or `queue` | **Verified** | Default Reply Threads batches to `queue` so comments do not unexpectedly alter an in-progress turn. |
| Prompt metadata | Prompt request accepts `metadata`; projected user messages expose metadata | **Verified** | Add `replyThreadsBatchID` and `promptHash` metadata for reconciliation. |
| Assistant source text | Session messages return assistant `content[]`; text entries contain `type: "text"` and `text` | **Verified** | Search canonical assistant text without relying on legacy message-part APIs. |
| Complete session history | The message endpoint is paginated; context contains only messages after the last compaction | **Verified** | Use paginated history for attribution when selection may come from older visible history. |
| Renderer selection | A loaded TUI probe observed `typeof context.renderer.getSelection === "function"` | **Runtime verified; selected-text behavior still needs interaction** | Keep access behind a small adapter and finish the selection-lifetime test. |
| Multiline stock prompt dialog | Binary inspection shows a one-row, no-wrap textarea | **Unsuitable for the desired UX** | Implement a custom JSX comment editor. |
| Modern TUI plugin API | A package-style probe loaded on `beta-19271` and exposed `app`, `attention`, `client`, `data`, `keymap`, `location`, `markdown`, `options`, `renderer`, `storage`, `theme`, `themeMode`, and `ui` | **Runtime verified** | Build against `@opencode/plugin` V2 and keep a loader smoke test in CI. |
| Local installed plugin types | `@opencode-ai/plugin` is version `1.4.10` and exposes a legacy TUI API | **Stale/incompatible** | Use `@opencode/plugin`, not `@opencode-ai/plugin`. |
| TUI config location | Isolated launch migrated `tui.json` to `cli.json` with `plugins` | **Verified** | Installation docs must target `cli.json`. |
| Durable storage behavior | Published V2 beta types state that stores persist to disk and stay live-synced across running TUI instances | **Contract verified; conflict semantics need a test** | Use one store update mutation per transaction and retain a two-instance integration test. |
| Product package loading | The repository package, using `exports["./tui"] = "./src/app/TuiPlugin.tsx"`, started in an isolated `beta-19271` TUI without plugin setup/runtime errors | **Verified** | Preserve this isolated startup smoke test. |
| Message pagination | TUI data lacks pagination, but the connected client's `message.list` supports cursor pagination and assistant filtering | **Implemented** | Attribution pages through all assistant messages through the host-connected client. |
| Dependency audit | `npm audit --omit=dev` reports transitive advisories through the pinned preview `@opencode/plugin`, including high/critical findings | **Known preview-SDK risk** | Do not publish 0.1 without reassessing a newer compatible SDK; do not apply an unreviewed forced upgrade. |

Concurrency-sensitive operations now validate and mutate inside one `storage.store` update callback. Unit simulations prove that serialized updates preserve concurrent additions and allow only one competing batch claim. A live two-TUI test remains required to verify that the host implementation serializes callbacks across processes as documented.
| Inline transcript decoration | No message/range slot is documented | **Not supported by the public contract** | Keep MVP indicators in composer/panel surfaces. |

## Important Findings

### Stable message IDs improve submission recovery

The prompt endpoint accepts a caller-provided message ID. Reply Threads should generate and persist a `msg_...` ID before calling OpenCode, then reuse it on retry. Batch metadata should also include a batch ID and prompt hash. Recovery should verify the admitted user message through paginated session history and metadata.

### The message model differs from the original assumption

The running V2 API projects assistant text under:

```text
Session.Message.Assistant.content[].type = "text"
Session.Message.Assistant.content[].text
```

The anchor should therefore use `messageID` plus a content-block index. A durable `partID` must not be required unless the supported client type proves one exists.

### Active context is insufficient for attribution

`GET /api/session/{sessionID}/context` returns messages only after the last compaction. The full message endpoint is paginated. Since a user may select an older visible response, attribution must page through history until all candidates are found or a documented safety limit is reached.

### The stock prompt dialog should not collect comments

The convenience prompt dialog is optimized for one-line input. Response comments need multiline editing, visible quote context, and validation. Use the right-hand JSX annotation editor with a wrapping textarea.

### Package naming matters

The current V2 SDK package is `@opencode/plugin`. The locally installed `@opencode-ai/plugin` declarations are older and expose different command, slot, state, and lifecycle APIs.

## Remaining Interactive Probes

The package-style loader probe now succeeds. These checks still require terminal interaction or multiple running instances:

1. Confirm `context.renderer.getSelection()?.getSelectedText()` from a registered command after mouse selection.
2. Confirm selection lifetime after invoking a command or opening a dialog.
3. Confirm route transition from `{ type: "home" }` to `{ type: "session", sessionID }` in an active session.
4. Render and interact with the verified `session.composer.top` and `session.panel` contracts.
5. Confirm conflict behavior with two TUI instances updating one durable store.
6. Confirm cleanup after plugin unload/reload.

## Recommendation

The loader requirement has been proven with a package-style probe. Scaffold against a pinned `@opencode/plugin` V2 release, preserve that smoke test, and next implement only a visible command that reports selection and route state. Complete the remaining interactive probes before the full UI. The domain model, formatter, stable prompt ID, and attribution tests can proceed independently.

## Preliminary Domain Tests

The repository now includes typed implementations for the riskiest pure logic:

- `src/features/annotate/capture/quote-attribution.ts`
- `src/features/send/preparation/compose-prompt.ts`
- `src/features/threads/data/thread-types.ts`
- `src/features/threads/data/thread-repository.ts`
- `src/features/annotate/capture/quote-attribution.test.ts`
- `src/features/send/preparation/compose-prompt.test.ts`
- `src/features/threads/data/thread-repository.test.ts`

The tests prove conservative duplicate handling, Unicode/control-sequence/whitespace normalization, indexed content anchors, deterministic batch composition, multiline block quoting, prompt hashing, and batch metadata. They intentionally do not claim that rendered Markdown can always map to source text; unmatched cases remain supported.

## Probe Notes

- A raw TypeScript path with ad hoc exports did not execute setup.
- A directory with `package.json`, a `./tui` export, and a default `{ id, setup }` definition loaded successfully.
- This means local-development documentation should use a valid package directory or a source file that follows the exact `Plugin.define(...)` default-export contract; tests should cover both supported loading forms before documenting them.

## First click after an annotation was swallowed (host focus overlay)

Symptom: after typing or cancelling an annotation in the sidebar, the first click
on a toolbar button (for example **Send pending replies**) did nothing; the second
worked. Reproduced in a real TUI, then traced:

- Instrumenting the button showed it received **no mouse events** on that click.
- Wrapping the renderer's mouse delivery showed the `down` went to an anonymous
  `box` (a child of `session-pane`) instead: a transparent, full-size, `zIndex: 1`
  overlay.
- The host source explains it: it tracks which pane has input focus; while the
  right pane is focused (the annotation textarea focuses inside it) it renders that
  overlay over the session pane, and the overlay's mouse-up returns focus to the
  left pane. So the first click elsewhere is spent returning focus.

Fix (`src/opencode-helpers/panel-focus.ts`): when an annotation closes (save, Cancel, Esc,
or leaving Reply Mode) dispatch the host's own `pane.focus.left` ("Focus session
pane") command via the documented `keymap.dispatch`. That command is only
available for a side-by-side panel, not fullscreen, and is a no-op if it does not
exist in another host version. Verified in a real TUI: one click now suffices after
save, Esc and the Cancel button, and re-selecting immediately after cancelling works.
Trade-off: after an annotation closes, focus is on the prompt, so the sidebar's
`E`/`D`/arrow shortcuts need a click into the sidebar first.

## Repeated annotation Enter binding

Verified on beta-19271: select text, save the first annotation with Enter, select another
excerpt in the same open panel, type, and press Enter. The second editor accepted text but
Enter did not save; clicking Save still worked. Closing an annotation dispatches
`pane.focus.left`, and keymap layers created inside the panel become inactive without host
panel input focus. Focusing the new textarea alone does not reactivate that panel scope.

The annotation workflow now registers its targeted Enter layer from the mounted app slot.
Each editor supplies the current textarea on mount and releases it on unmount. This keeps
the binding outside the panel input scope without making it consume Enter outside the editor.
Live verification saved three consecutive selections with Enter, then discarded one pending
comment using its new card button.

## Linking a reply to its prompt (threaded replies)

### Complete review history and cursor ordering

Discarding a pending comment could rebuild the conversation tree using only the host's
recent message cache. Intact sent comments then displayed "Reply is not in the loaded
history." Stored sent records and batch references remained present.

The full-history helper also sent `order: "desc"` together with `cursor` on later pages.
Beta-19271 rejects this with "Cursor cannot be combined with order," causing the helper to
fall back to the limited cache. Message cursors encode their ordering: only the first page
sets `order`; later pages send `cursor` alone. The same fix applies to admission reconciliation.

Review surfaces now use `features/replies/review-history.tsx` to load all pages and overlay
live cached updates. Pending edits/discards do not reset that snapshot. Failed refreshes
retain the earlier history for the same session, and switching sessions excludes old data.
Replies remain derived; no answers are added to durable plugin storage.

Verified through the connected server that all stored sent prompts remained present. A live
isolated TUI probe loaded an answer behind 120 newer messages, discarded a pending comment,
and retained the older answer and unchanged sent batch. Automated tests also cover cache
truncation, partial API failure and session isolation. Oxlint rejects explicit cursor/order
collisions in message-list calls.

### Reply attribution

Checked against real session history and a throwaway server on `beta-19271`.

- **No link from an assistant message to its prompt.** Stored user messages have `text`, `metadata`, `files`, `agents` and `time`; assistant messages have `content`, `finish`, `model`, `tokens`, `snapshot` and so on. There is no parent ID, prompt ID or metadata on an assistant message, so a prompt's reply can only be found by position.
- **One turn is many assistant messages.** Each tool step is its own assistant message (one real reply was 23 of them). Earlier ones are narration; the last has `finish: "stop"`. A reply is every assistant message after the prompt, up to the next user or synthetic message.
- **Real model behaviour.** In three real replies to the earlier prompt wording ("treat every excerpt as a separate review thread"), the model answered under `## Thread 1`, `## Thread 2` and so on, then a consolidated answer. The current wording asks for `## <label>` explicitly; it has been verified end to end with injected replies, not yet against a real model.
- **Data the plugin can read live.** `context.data.session.message.list(sessionID)` is the synchronized cache (oldest first) and `context.data.session.status(sessionID)` is `idle` or `running`. The paginated `client.message.list` returns newest first with `order: "desc"`.
- **Chat Markdown quirk.** A heading that is the very first line of a message is shown literally (`## 1`); the same heading later in the message renders as a heading. It is independent of the heading text.
- **Entry point.** The panel must be reachable when nothing is pending, or sent threads and their replies cannot be opened. It is opened from the section the plugin adds to OpenCode's own sidebar (which shows a button even when only pending threads exist), by selecting text in Reply Mode, and by `/threads`. The toolbar above the prompt has no button for it.

## `sidebar.content` and `sidebar.footer` slots

The SDK publishes `sidebar.content` and `sidebar.footer` (input: `{ sessionID }`). Verified on `beta-19271` with a throwaway plugin in a real TUI: a claim appended to `sidebar.content` renders inside OpenCode's own session sidebar, below the session title, and `sidebar.footer` renders at its bottom. The host shows one right-hand pane at a time, so opening the Reply Threads panel replaces the host sidebar (and with it our section), and the host hides its sidebar on narrow terminals. The plugin therefore also keeps the toolbar's Thread history button, which is always reachable.

The host's rule (from its source): the sidebar shows by itself only when the terminal is wider than 120 columns (after the vertical tabs), never in a subagent session, and the user can force it on or off with the host's sidebar toggle. At 160 columns it is about 40 columns wide. A hybrid is used: a compact tree there (one line per comment, no editor), and the full panel for editing and long answers, because the panel's focus model is what the annotation editor was built and verified against. `scrollChildIntoView` on the panel's scrollbox is used to jump to a comment.


## Reactive workflow module extension on beta-19271

During the vertical-slice migration, extracting annotation signals from `src/tui.tsx`
into a `.ts` module passed typecheck and the component tests, but failed in the real TUI:
Ctrl+Y showed the enabled toast while the toolbar and selection tracker still saw disabled.
Keeping the signal-owning module as `src/features/annotate/annotation-workflow.tsx` restored
reactivity. The exact loader mechanism has not been established. The tested workaround is
recorded here and in the annotate README; do not rename it to `.ts` without live verification.

## Saved repository validation

The host's live storage view includes reactive symbol metadata. Passing that proxy directly
to the JSON schema caused a startup error ("Cannot convert a symbol to a string"). Validate
a plain JSON snapshot at the storage boundary while keeping the original live view for UI
reactivity. Writes validate their snapshots before and after mutation. A missing legacy
revision defaults locally to zero and is persisted by the next storage transaction.

The live feature smoke restarts the TUI with an unsupported saved-data version and verifies
that it reports the problem, leaves the file unchanged and does not mount annotation actions.
Its other checks use fixture history and no model prompts: repeated Enter saves, empty/typed
Cancel, prefilled editing and discard while retaining an answer behind 120 newer messages.
Screen/focus conditions and quiet frame boundaries replace fixed multi-second startup sleeps.
