import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"
import plugin from "./oxlint-plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } })
const layer = (bind) => `context.keymap.layer(() => ({ commands: [{ bind: ${JSON.stringify(bind)}, run() {} }] }))`

tester.run("annotation-enter-scope", plugin.rules["annotation-enter-scope"], {
  valid: [
    { filename: "src/app/TuiPlugin.tsx", code: layer("return") },
    { filename: "src/features/annotate/annotation-workflow.tsx", code: layer("return") },
    { filename: "src/features/threads/panel/panel-navigation.tsx", code: layer("escape") },
    { filename: "src/features/annotate/editor/AnnotationEditor.test.tsx", code: layer("return") },
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: 'const command = { bind: "return" }' },
  ],
  invalid: [
    { filename: "src/features/annotate/editor/AnnotationEditor.tsx", code: layer("return"), errors: [{ messageId: "scope" }] },
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: layer("return,ctrl+j"), errors: [{ messageId: "scope" }] },
    { filename: "src/features/annotate/editor/AnnotationEditor.tsx", code: 'context.keymap["layer"](() => ({ commands: [{ "bind": "kpenter", run() {} }] }))', errors: [{ messageId: "scope" }] },
  ],
})

tester.run("reactive-module-extension", plugin.rules["reactive-module-extension"], {
  valid: [
    { filename: "src/features/annotate/annotation-workflow.tsx", code: 'import { createSignal } from "solid-js"; createSignal(false)' },
    { filename: "src/features/threads/data/thread-labels.ts", code: 'const createSignal = () => 1; createSignal()' },
    { filename: "src/features/threads/data/example.test.ts", code: 'import { createMutable } from "solid-js/store"; createMutable({})' },
    { filename: "src/features/threads/data/thread-types.ts", code: 'import type { Accessor } from "solid-js"; export type Read = Accessor<string>' },
  ],
  invalid: [
    { filename: "src/features/annotate/annotation-workflow.ts", code: 'import { createSignal as signal } from "solid-js"; signal(false)', errors: [{ messageId: "extension" }] },
    { filename: "src/features/threads/panel/panel-navigation.ts", code: 'import * as Solid from "solid-js"; Solid.createMemo(() => 1)', errors: [{ messageId: "extension" }] },
    { filename: "src/features/threads/data/state.ts", code: 'import { createStore } from "solid-js/store"; createStore({})', errors: [{ messageId: "extension" }] },
  ],
})

tester.run("component-filename", plugin.rules["component-filename"], {
  valid: [
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: "export function ThreadPanel() { return <box /> }" },
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: "export const ThreadPanel = () => <box />" },
    { filename: "src/features/threads/panel/ThreadPanel.test.tsx", code: "export function Fixture() { return <box /> }" },
    { filename: "src/features/threads/data/thread-types.ts", code: "export interface ReplyThread { id: string }" },
    { filename: "src/app/TuiPlugin.tsx", code: 'export default Plugin.define({ id: "reply-threads", setup() {} })' },
  ],
  invalid: [
    { filename: "src/features/threads/panel/thread-panel.tsx", code: "export function ThreadPanel() { return <box /> }", errors: [{ messageId: "filename" }] },
    { filename: "src/features/composer/ComposerStatus.tsx", code: "export const ComposerToolbar = () => <box />", errors: [{ messageId: "filename" }] },
    { filename: "src/features/threads/panel/Other.tsx", code: "export default function ThreadPanel() { return <box /> }", errors: [{ messageId: "filename" }] },
  ],
})

tester.run("message-pagination-options", plugin.rules["message-pagination-options"], {
  valid: [
    { filename: "src/opencode-helpers/message-history.ts", code: 'context.client.message.list({ sessionID, order: "desc", limit: 100 })' },
    { filename: "src/opencode-helpers/message-history.ts", code: "context.client.message.list({ sessionID, cursor, limit: 100 })" },
    { filename: "src/opencode-helpers/message-history.ts", code: 'context.client.message.list({ sessionID, ...(cursor ? { cursor } : { order: "desc" }) })' },
    { filename: "src/opencode-helpers/message-history.ts", code: 'context.client.session.list({ cursor, order: "desc" })' },
  ],
  invalid: [
    { filename: "src/opencode-helpers/message-history.ts", code: 'context.client.message.list({ sessionID, cursor, order: "desc" })', errors: [{ messageId: "pagination" }] },
    { filename: "src/features/send/recovery/reconcile-admission.ts", code: 'context.client.message["list"]({ sessionID, "cursor": cursor, "order": "desc" })', errors: [{ messageId: "pagination" }] },
  ],
})

tester.run("setup-keymap-scope", plugin.rules["setup-keymap-scope"], {
  valid: [
    { filename: "src/app/TuiPlugin.tsx", code: `Plugin.define({ setup(context) { context.ui.slot({ append: "app", render: () => { ${layer("return")} } }) } })` },
    { filename: "src/app/TuiPlugin.tsx", code: `Plugin.define({ setup(context) { function Commands() { ${layer("escape")} } context.ui.slot({ append: "app", render: Commands }) } })` },
    { filename: "src/app/commands.ts", code: `export function registerCommands(context) { ${layer("return")} }` },
    { filename: "src/app/TuiPlugin.test.tsx", code: `Plugin.define({ setup(context) { ${layer("return")} } })` },
    { filename: "src/app/TuiPlugin.tsx", code: 'Plugin.define({ setup(context) { context.ui.toast.show({ message: "keymap.layer" }) } })' },
  ],
  invalid: [
    { filename: "src/app/TuiPlugin.tsx", code: `Plugin.define({ setup(context) { ${layer("return")} } })`, errors: [{ messageId: "setup" }] },
    { filename: "src/app/TuiPlugin.tsx", code: `Plugin.define({ setup: async (context) => { await ready(); ${layer("escape")} } })`, errors: [{ messageId: "setup" }] },
    { filename: "src/app/TuiPlugin.tsx", code: `Plugin.define({ setup(context) { (() => { ${layer("return")} })() } })`, errors: [{ messageId: "setup" }] },
    { filename: "src/app/TuiPlugin.tsx", code: 'import { Plugin as HostPlugin } from "@opencode/plugin/tui"; HostPlugin.define({ setup(context) { context.keymap["layer"](() => ({ commands: [] })) } })', errors: [{ messageId: "setup" }] },
  ],
})

tester.run("review-history-source", plugin.rules["review-history-source"], {
  valid: [
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: 'import { createReviewHistory } from "../../replies/review-history.js"; createReviewHistory(options)' },
    { filename: "src/features/threads/sidebar/SidebarEntry.tsx", code: 'import { sessionRunning } from "../../../opencode-helpers/message-history.js"; sessionRunning(context, id)' },
    { filename: "src/features/threads/sidebar/SidebarEntry.tsx", code: 'import * as history from "../../../opencode-helpers/message-history.js"; history.sessionRunning(context, id)' },
    { filename: "src/features/replies/review-history.tsx", code: 'import { cachedHistory } from "../../opencode-helpers/message-history.js"; cachedHistory(context, id)' },
    { filename: "src/features/threads/panel/ThreadPanel.test.tsx", code: "context.data.session.message.list(id)" },
    { filename: "src/features/threads/sidebar/SidebarEntry.tsx", code: "context.data.session.status(id)" },
  ],
  invalid: [
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: 'import { cachedHistory as recent } from "../../../opencode-helpers/message-history.js"; recent(context, id)', errors: [{ messageId: "history" }] },
    { filename: "src/features/threads/sidebar/SidebarEntry.tsx", code: 'import * as history from "../../../opencode-helpers/message-history.js"; history.cachedHistory(context, id)', errors: [{ messageId: "history" }] },
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: 'import * as history from "../../../opencode-helpers/message-history.js"; const { cachedHistory: recent } = history', errors: [{ messageId: "history" }] },
    { filename: "src/features/threads/panel/ThreadPanel.tsx", code: "props.context.data.session.message.list(id)", errors: [{ messageId: "history" }] },
    { filename: "src/features/replies/ReplyBlock.tsx", code: 'context.data.session["message"]["list"](id)', errors: [{ messageId: "history" }] },
  ],
})

tester.run("no-adjacent-jsdoc", plugin.rules["no-adjacent-jsdoc"], {
  valid: [
    { filename: "src/features/threads/data/thread-labels.ts", code: "/** Encodes a label. */\nexport function encode() {}\n/** Decodes a label. */\nexport function decode() {}" },
    { filename: "src/features/threads/data/thread-labels.ts", code: "/** @file Hierarchical labels. */\n/** Encodes a label. */\nexport function encode() {}" },
    { filename: "src/features/threads/data/thread-labels.ts", code: "/** Explains labels. */\n// Separate explanation.\n/** Encodes a label. */\nexport function encode() {}" },
    { filename: "src/features/threads/data/thread-labels.test.ts", code: "/** Fixture. */\n/** Another fixture. */\nfunction encode() {}" },
  ],
  invalid: [
    { filename: "src/features/threads/data/thread-labels.ts", code: "/** Old description. */\n\n/** Current description. */\nexport function encode() {}", errors: [{ messageId: "duplicate" }] },
    { filename: "src/features/threads/data/thread-labels.ts", code: "/** First description. */ /** Second description. */ /** Third description. */\nexport function encode() {}", errors: [{ messageId: "duplicate" }, { messageId: "duplicate" }] },
  ],
})

tester.run("informative-function-docs", plugin.rules["informative-function-docs"], {
  valid: [
    "/** Allocates the next unused label in this session. */\nexport function nextLabel() { return 1 }",
    "/** Counts unsent comments in the active session. */\nexport const pendingCount = () => 1",
    "/** Increments the counter.\n * @param count - Number of completed operations.\n */\nexport function increment(count: number) { return count + 1 }",
  ],
  invalid: [
    { code: "/** Get next count. */\nexport function getNextCount() { return 1 }", errors: [/only repeats the name/] },
    { code: "/** Pending count. */\nexport const pendingCount = () => 1", errors: [/only repeats the name/] },
    { code: "/** Increments the counter.\n * @param count - count\n */\nexport function increment(count: number) { return count + 1 }", errors: [/only repeats the name/] },
  ],
})
