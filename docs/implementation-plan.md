# Reply Threads Implementation Plan

## Goal

Build an OpenCode 2 TUI plugin that lets a user select an excerpt from an assistant response, attach a comment to it, repeat that operation for other excerpts, and send all pending comments as one structured prompt.

## Product Principles

1. **Selection-first:** the fastest path is select text, invoke one command, and type a comment.
2. **No transcript mutation:** annotations remain plugin data; the original OpenCode conversation is never rewritten.
3. **Session-aware:** every thread belongs to an OpenCode session and records the best available source-message identity.
4. **Batch-friendly:** users may collect and edit multiple comments before sending.
5. **Recoverable:** a failed send keeps the draft intact.
6. **Progressive enhancement:** the first release uses supported plugin surfaces and leaves inline transcript indicators for a later host extension.

## OpenCode 2 Capability Status

The design is based on the current OpenCode 2 documentation, but this repository targets a preview build whose exact runtime API must be verified before implementation. Documentation evidence and installed-runtime evidence are tracked separately.

| Capability | Documentation evidence | Runtime status |
| --- | --- | --- |
| Renderer access | `context.renderer` is documented. | Must verify selection retrieval and lifecycle in the supported V2 build. |
| Commands | `context.keymap.layer(...)` is documented. | Must verify command shape and terminal-safe binding. |
| Dialogs | `context.ui.dialog` and custom JSX dialogs are documented. | Must verify multiline comment editing and focus behavior. |
| Composer contribution | `session.composer.top` and prompt-footer slots are documented. | Must verify exact slot props in the supported V2 build. |
| Thread panel | `session.panel` and `context.ui.panel` are documented. | Must verify mounting, focus, narrow-terminal behavior, and cleanup. |
| Session messages | `context.data.session.message` synchronization/read APIs are documented. | Must verify text-part shape and access to source Markdown. |
| Durable state | `context.storage.store(...)` is documented. | Must verify scope and concurrent-update behavior across TUI instances. |
| Prompt submission | A connected `context.client` is documented. | Must verify the exact session-prompt method, delivery semantics, and return value. |

The current public API does not document a message-level or text-range slot in the stock assistant transcript. Therefore, the first release will show thread state in the composer and panel rather than altering assistant message rendering.

Until Phase 0 passes, all host-facing names and method shapes in this plan are **provisional integration assumptions**, not implementation contracts.

## Scope

### MVP

- Capture the current text selection.
- Reject empty selections with a useful toast.
- Resolve the selected quote to an assistant message only when attribution is unique and defensible.
- Ask the user for a comment.
- Store a pending thread under the active session.
- Display a pending-thread count above or beside the composer.
- Open a session panel listing pending and sent threads.
- Edit or delete pending threads.
- Batch all pending threads into one prompt.
- Send the prompt through the connected OpenCode client.
- Record a sending batch before prompt admission and mark it sent only after admission succeeds.
- Preserve the draft and show an error when prompt admission fails.
- Persist threads across TUI restarts.

### Post-MVP

- Per-thread status: pending, sent, resolved, reopened.
- General batch preface or closing note.
- Duplicate-selection handling.
- Quote-context expansion before and after the selected text.
- Configurable keybindings and output template.
- Import/export of thread history.
- Tests against remote OpenCode servers.
- Optional server-side storage/RPC if threads must be shared between machines.

### Explicitly Deferred

- Inline badges beside exact ranges in the stock assistant message.
- Replacing the complete OpenCode session transcript.
- Mutating persisted assistant messages to insert annotation markers.
- Synchronizing thread data across users or devices.

## User Experience

### Add a thread

1. The user either selects text directly, or clicks **Reply Mode** above the composer and then selects text; in Reply Mode, selection opens the comment editor automatically.
2. The user invokes **Reply Threads: Comment on selection** from the command palette/slash command, or clicks **Add selected text** while comment mode is active.
3. The plugin reads and normalizes the selection.
4. The plugin resolves the quote to a source message when possible.
5. A dialog displays the quote and accepts the comment.
6. Confirming saves a pending thread and updates the composer indicator.

### Review threads

1. The user invokes **Reply Threads: Open threads**.
2. A session panel lists threads grouped by status.
3. The user can inspect, edit, or delete pending threads.
4. Sent threads remain visible as history.

### Send a batch

1. The user invokes **Reply Threads: Send pending replies**.
2. The plugin previews the generated prompt and asks for confirmation.
3. On successful admission, pending threads become sent and receive a batch ID.
4. On failure, threads remain pending and the error is reported.

## Proposed Commands

Final default bindings should be selected only after checking conflicts in a running OpenCode 2 build.

| Command ID | Palette title | Purpose |
| --- | --- | --- |
| `reply-threads.add` | Comment on selection | Capture selected response text and add a comment. |
| `reply-threads.comment-mode` | Toggle Reply Mode | `Ctrl+Y` turns Reply Mode on or off; selecting text while on opens the annotation panel. |
| `reply-threads.open` | Open reply threads | Open the session thread panel. |
| `reply-threads.send` | Send pending replies | Preview and submit one batch prompt. |
| `reply-threads.clear` | Clear pending replies | Remove pending threads after confirmation. |

Suggested slash commands:

- `/thread`
- `/threads`
- `/threads-send`

## Delivery Phases

### Phase 0 — API spike

Purpose: retire the riskiest assumptions before building the UI.

- Scaffold a local OpenCode 2 TUI plugin.
- Preserve the successful package-style loader smoke test against the supported OpenCode build.
- Verify the already-observed `context.renderer.getSelection()` by capturing actual selected text from a registered command.
- Verify active-session discovery from `context.ui.router.current()`.
- Verify message synchronization and part access.
- Verify prompt admission through the host client. The running API already confirms caller-provided message IDs, metadata, and `steer`/`queue`; the interactive test must confirm the client method shape.
- Verify composer and `session.panel` slots mount and dispose correctly.
- Verify whether a normal dialog prompt supports multiline comments; if it does not, prove the custom JSX editor approach.
- Verify storage scope, atomic update behavior, and consistency across two TUI instances.
- Verify whether rendered selections can be mapped to source text after Markdown formatting, whitespace collapse, syntax highlighting, and line wrapping.
- Document any API differences between the installed beta and the current V2 documentation.

**Exit criterion:** an evidence note records the tested OpenCode version and exact APIs; one command captures selected text, identifies the active session, displays a multiline-capable comment UI, and proves a disposable prompt submission without altering assistant messages.

### Phase 0 deliverable: compatibility matrix

Record the result in `docs/compatibility.md` using this shape:

| OpenCode version | Selection | Active session | Messages | Storage | Composer slot | Panel | Prompt admission | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tested build | Exact API and behavior | Exact API and behavior | Exact API and content shape | Scope/concurrency behavior | Exact slot and props | Exact panel contract | Method, delivery, and return shape | Pass/fail with known limitations |

Implementation must consume only APIs proven by this matrix or place version-specific access behind a small compatibility adapter.

### Phase 1 — Core domain and persistence

- Promote the preliminary attribution and batch-composition spikes in `src/domain/` into typed production modules.
- Implement domain types and runtime validation.
- Implement immutable store operations.
- Use a schema version in all persisted data.
- Implement migration scaffolding before the first release.
- Add unit tests for add, edit, remove, status transitions, and migrations.

**Exit criterion:** thread collections round-trip through storage without UI dependencies.

### Phase 2 — Selection and message attribution

- Normalize terminal selection without changing meaningful internal whitespace.
- Read paginated assistant-message history, not only the post-compaction active context.
- Match the quote against messages newest-first.
- Record an exact source only for a unique match.
- Record ambiguity explicitly when the same quote occurs more than once.
- Permit an unanchored thread when the text cannot be matched.
- Add a normalization pipeline that keeps both the raw selection and a derived comparison form.
- Add tests for exact, duplicate, multiline, formatted, Unicode, ANSI-free, whitespace-normalized, and unmatched quotes.

**Exit criterion:** every captured thread records `exact`, `ambiguous`, or `unmatched` attribution rather than silently guessing.

### Phase 3 — Capture workflow

- Register add/open/send/clear commands.
- Build the comment dialog with quote preview.
- Add empty-selection, no-session, and empty-comment validation.
- Add success/error toasts.
- Add a composer status contribution showing the pending count.

**Exit criterion:** a user can capture several durable pending comments without leaving the session.

### Phase 4 — Thread panel

- Add a `session.panel` contribution named `reply-threads.review`.
- List threads with quote, comment, source confidence, and status.
- Support edit and delete for pending threads.
- Support keyboard navigation and accessible focus states.
- Provide an empty state and concise key hints.

**Exit criterion:** all pending comments can be managed without editing storage manually.

### Phase 5 — Batch composition and submission

- Generate deterministic Markdown from pending threads.
- Include source message IDs only as metadata for debugging, not as instructions to the model.
- Preview the batch before submission.
- Prevent duplicate concurrent sends with an in-flight state.
- Persist a batch record and transition its threads to `sending` before the network call.
- Generate and persist the caller-provided `msg_...` prompt ID and batch metadata before the network call.
- Submit to the active session through the plugin client.
- Mark threads sent only after successful admission and persist the admitted message ID when returned.
- Reuse the same prompt ID for retries so admission remains idempotent.
- On a definite pre-admission failure, return threads to pending.
- On an indeterminate failure, retain `sending` state and reconcile against session history before allowing retry.

**Exit criterion:** multiple comments are delivered as one readable user message with failure-safe state transitions.

### Phase 6 — Packaging and compatibility

- Export the TUI plugin through `./tui`.
- Add peer dependencies required by OpenTUI and Solid.
- Document global and local installation.
- Add an OpenCode 2 compatibility policy.
- Add a smoke test matrix covering the supported V2 beta/release channel.
- Add release notes and semantic versioning.

**Exit criterion:** a clean installation can load the plugin and complete the primary workflow.

### Phase 7 — Inline indicator exploration

- Propose upstream slots for assistant-message or message-part decoration.
- Prototype a supported `session.message.after` contribution if OpenCode adds one.
- Avoid renderer-tree traversal or persisted-message mutation in production code.

**Exit criterion:** inline indicators ship only against an explicit, tested host extension point.

## Data Model

```ts
type ThreadStatus = "pending" | "sending" | "sent" | "resolved"
type BatchStatus = "submitting" | "sent" | "failed" | "unknown"
type AnchorConfidence = "exact" | "ambiguous" | "unmatched"

interface ReplyThread {
  id: string
  sessionID: string
  messageID?: string
  contentIndex?: number
  quote: {
    raw: string
    normalized: string
  }
  comment: string
  anchor: {
    confidence: AnchorConfidence
    start?: number
    end?: number
  }
  status: ThreadStatus
  batchID?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
}

interface ReplyBatch {
  id: string
  sessionID: string
  threadIDs: string[]
  promptMessageID: string
  promptHash: string
  status: BatchStatus
  admittedMessageID?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
}

interface ThreadRepositoryState {
  schemaVersion: 1
  sessions: Record<
    string,
    {
      threads: ReplyThread[]
      batches: ReplyBatch[]
    }
  >
}
```

Character offsets are hints against the source text part. `quote.raw` is canonical for display; `quote.normalized` is derived only for matching. Markdown rendering and terminal wrapping prevent stable screen-coordinate anchors.

## Batch Prompt Contract

The prompt is deterministic and deliberately token-lean (about 20 tokens of fixed overhead plus about 7 per thread, measured with the `o200k_base` tokenizer; the quoted text, not the template, dominates cost):

```md
Reply to each comment on your previous answer; then give a revised answer if needed.

1.
> Selected excerpt from the assistant response.

COMMENT: Clarify why this approach is preferred.

2.
> Another selected excerpt.

COMMENT: Include the retry behavior and failure mode.
```

Quotes are escaped as Markdown blockquotes, every comment follows a blank line and an all-caps `COMMENT:` label (the chat is plain text, so this is what makes the comment easy to spot; both are free in tokens) so a comment that happens to start with `>` is never mistaken for a quote, and comments remain user-authored text. No hidden instructions are inserted. `src/features/send/preparation/compose-prompt.test.ts` pins the exact format and guards the overhead budget.

### Labeled send (chat appearance)

User messages render as plain text and plugins cannot style them, so a batch is sent as two messages when the session is idle:

1. a **synthetic** message with `resume: false`: its `text` is the instruction line (sent to the model, hidden in the chat) and its `description` is a display-only label, `Reply Threads · N comments`, shown as a grey line above the next message and never sent to the model (zero tokens);
2. the user prompt containing only the threads.

Findings verified against OpenCode `0.0.0-beta-19271` (see `src/features/send/submission/submit-batch.ts`):

- Both messages **must use `steer` delivery**. With `queue`, the synthetic message starts a turn on its own, so the model answers only the instruction line and the real prompt waits behind it for a second turn.
- `steer` injects into a running turn, so the labeled form is used **only when the session is idle**; a busy session gets the original single queued message.
- The label ID sorts before the prompt ID (`…a` / `…b`) because the chat orders by message ID.
- The label is cosmetic and must never block a send: if it fails, any half-admitted label is cancelled and the plain message is sent.
- A still-pending label is cancelled when the prompt is definitively rejected, or when reconciliation proves the prompt never arrived, so it cannot leak into the user's next prompt. It is not cancelled on an indeterminate failure, because the prompt may have been admitted and consumed it.
- The reconciliation hash covers the complete logical prompt (instruction plus threads), so it is identical in both modes.

Not verified: how every model provider handles two consecutive user messages (the test server has no provider credentials).

## Error and Concurrency Policy

- **No active session:** disable session commands or show a warning.
- **No selection:** do not open a blank comment thread.
- **Ambiguous source:** save the quote with `anchor.confidence = "ambiguous"`; do not invent a message ID.
- **Storage failure:** do not report success or accept a send whose durable batch record cannot be written.
- **Definite prompt failure:** return the batch's threads to pending and record the failure.
- **Indeterminate prompt failure:** keep the batch in `unknown`/threads in `sending`; reconcile with admitted session messages before retrying to avoid duplicate prompts.
- **Concurrent send:** acquire one per-session send operation using storage-backed state; subsequent requests focus the existing progress state.
- **Delivery:** default to `queue` so a batch does not steer an in-progress agent turn; expose `steer` only as an explicit future option.
- **Session deletion:** retain data until explicit cleanup in the initial version, then add pruning with confirmation.
- **Plugin reload:** dispose commands, slots, listeners, and transient UI modes cleanly.

## Testing Strategy

### Unit tests

- Selection normalization.
- Quote-to-message attribution.
- Store operations and migrations.
- Batch Markdown generation and escaping.
- Status transitions, crash recovery, reconciliation, and idempotency.

Preliminary Node tests already cover normalization, unique/duplicate attribution, deterministic formatting, Markdown block quoting, empty-batch rejection, hashing, and reconciliation metadata. These tests are feasibility evidence, not a substitute for the later typed implementation and TUI integration suite.

### Component tests

- Comment dialog validation.
- Pending-count contribution.
- Thread panel keyboard and pointer actions.
- Empty, ambiguous, sending, success, and failure states.

### Integration tests

- Load plugin in an isolated OpenCode 2 configuration.
- Capture a selection from an assistant response.
- Persist and restore a pending thread.
- Send multiple threads and inspect the admitted user prompt.
- Simulate prompt failure and confirm drafts survive.
- Simulate loss of the response after admission and confirm reconciliation prevents duplicate submission.
- Run two TUI instances against the same session and verify updates are not lost.
- Reload/disable the plugin and verify cleanup.

### Contract tests

- Compile against the minimum supported OpenCode 2 plugin package.
- Run a smoke plugin against each supported OpenCode 2 build/channel.
- Fail clearly when a required host capability is absent rather than partially registering the workflow.

### Manual acceptance

1. Ask OpenCode for an answer containing multiple paragraphs.
2. Select one paragraph and add a comment.
3. Select another paragraph and add a second comment.
4. Restart OpenCode and confirm both drafts remain.
5. Edit one thread and delete neither.
6. Send the batch.
7. Confirm one user prompt contains both quotes and comments.
8. Confirm the panel marks both threads sent.

## Security and Privacy

- Store only the selected quote, comment, identifiers, and timestamps.
- Do not log response bodies or comments by default.
- Do not read clipboard contents; selection capture is explicit.
- Do not modify assistant-message records.
- Make external synchronization opt-in if introduced later.
- Treat selected text as potentially sensitive when rendering to logs, errors, exports, or telemetry.

## Definition of Done for Version 0.1

- The Phase 0 API spike is verified against the supported OpenCode 2 build.
- A user can add, edit, delete, persist, and batch-send reply threads.
- Ambiguous message attribution never silently binds to the wrong message.
- Definite failed sends restore pending threads; indeterminate sends remain recoverable without blind resubmission.
- Unit, component, and integration tests pass.
- Installation and command documentation are complete.
- No unsupported transcript-renderer mutation is used.

## Open Decisions

1. Which default keybinding has no conflict in supported OpenCode 2 terminals?
2. Should an empty comment be allowed as a quote-only thread?
3. Should sent threads be retained indefinitely or pruned after a configurable period?
4. Should a normal composer message be included as a batch preface?
5. What minimum OpenCode 2 version should the first package declare?
6. Should unresolved `unknown` batches require explicit user confirmation before retry?
