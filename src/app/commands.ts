import type { Context } from "@opencode/plugin/tui/context"
import type { ThreadRepositoryState } from "../features/threads/data/thread-types.js"
import { pendingThreads, recoverableBatches } from "../features/threads/data/thread-repository.js"
import { THREAD_PANEL } from "../features/threads/panel/panel-id.js"

/** Actions consumed by the app-scoped command layer; implementations stay in their feature. */
export interface CommandActions {
  activeSessionID: () => string | undefined
  isAnnotating: () => boolean
  enterSends: () => boolean
  commentOnSelection: () => Promise<void>
  handleReplyModeShortcut: () => Promise<void>
  openPanel: (threadID?: string) => void
  send: () => Promise<void>
  reconcile: () => Promise<void>
  clear: () => Promise<void>
}

/**
 * Mounts discovery and keyboard commands inside the host's app-slot provider scope.
 *
 * @param context - Host keymap, panel and toast APIs.
 * @param state - Threads repository used by command availability predicates.
 * @param actions - App-connected annotation, send, thread-management and panel actions.
 * @returns Nothing; keymap layers are owned by the mounted app rendering scope.
 */
export function registerCommands(context: Context, state: ThreadRepositoryState, actions: CommandActions): void {
  const { activeSessionID, isAnnotating, enterSends, commentOnSelection, handleReplyModeShortcut, openPanel, send, reconcile, clear } = actions

  /**
   * Registers the guarded Enter-to-send key layer.
   *
   * @returns Nothing; registers the base-mode Enter layer in the current app scope.
   */
  const registerEnterToSend = () => context.keymap.layer(() => ({
    priority: 100,
    commands: [{
      bind: "return",
      enabled: enterSends,
      run: () => {
        void send().catch((error) => {
          context.ui.toast.show({ message: error instanceof Error ? error.message : "Could not send reply threads.", variant: "error" })
        })
      },
    }],
  }))

  /**
   * Registers Reply Threads palette, slash-command and keyboard actions.
   *
   * @returns Nothing; registers palette, slash and shortcut commands in the app scope.
   */
  const registerFeatureCommands = () => context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        id: "reply-threads.add",
        title: "Comment on selection",
        description: "Open the annotation editor for selected assistant text",
        group: "Reply Threads",
        palette: true,
        slash: { name: "thread" },
        run: commentOnSelection,
      },
      {
        id: "reply-threads.comment-mode",
        title: "Toggle Reply Mode",
        description: "Turn Reply Mode on or off. In Reply Mode, selecting response text opens the annotation panel",
        group: "Reply Threads",
        bind: "ctrl+y",
        palette: true,
        run: handleReplyModeShortcut,
      },
      {
        id: "reply-threads.open",
        title: "Open reply threads",
        group: "Reply Threads",
        palette: true,
        slash: { name: "threads" },
        enabled: () => activeSessionID() !== undefined,
        run: () => { openPanel() },
      },
      {
        // Ctrl+L: toggle the panel. Ignored while an annotation is open so a stray
        // keypress cannot discard what is being typed (Esc and Hide threads still can).
        id: "reply-threads.toggle",
        title: "Toggle reply threads",
        group: "Reply Threads",
        bind: "ctrl+l",
        enabled: () => activeSessionID() !== undefined && !isAnnotating(),
        run: () => {
          if (context.ui.panel.current()?.name === THREAD_PANEL) context.ui.panel.close()
          else openPanel()
        },
      },
      {
        id: "reply-threads.send",
        title: "Send pending replies",
        group: "Reply Threads",
        palette: true,
        slash: { name: "threads-send" },
        enabled: () => {
          const sessionID = activeSessionID()
          return sessionID !== undefined && pendingThreads(state, sessionID).length > 0
        },
        run: send,
      },
      {
        id: "reply-threads.reconcile",
        title: "Reconcile uncertain replies",
        group: "Reply Threads",
        palette: true,
        slash: { name: "threads-reconcile" },
        enabled: () => {
          const sessionID = activeSessionID()
          return sessionID !== undefined && recoverableBatches(state, sessionID).length > 0
        },
        run: reconcile,
      },
      {
        id: "reply-threads.clear",
        title: "Clear pending replies",
        group: "Reply Threads",
        palette: true,
        slash: { name: "threads-clear" },
        enabled: () => {
          const sessionID = activeSessionID()
          return sessionID !== undefined && pendingThreads(state, sessionID).length > 0
        },
        run: clear,
      },
    ],
  }))
  registerFeatureCommands()
  registerEnterToSend()
}
