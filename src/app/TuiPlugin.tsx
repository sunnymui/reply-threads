import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createMemo, createSignal, on, Show } from "solid-js"
import { createAnnotationWorkflow } from "../features/annotate/annotation-workflow.js"
import { createSendWorkflow } from "../features/send/send-workflow.js"
import { createThreadActions } from "../features/threads/thread-actions.js"
import { loadThreadRepository } from "../features/threads/thread-storage.js"
import { THREAD_PANEL } from "../features/threads/panel/panel-id.js"
import { SidebarEntry } from "../features/threads/sidebar/SidebarEntry.js"
import { ThreadPanel } from "../features/threads/panel/ThreadPanel.js"
import { ComposerToolbar } from "../features/composer/ComposerToolbar.js"
import { registerCommands } from "./commands.js"

/**
 * Starts the terminal plugin and connects its features to OpenCode's UI.
 *
 * This file is the wiring diagram: it gives features access to stored threads,
 * connects user actions to feature functions, and tells OpenCode where to render
 * each component. The feature modules implement capture, sending and thread rules.
 */
export default Plugin.define({
  id: "reply-threads",
  setup(opencode) {
    // 1. Open the shared, durable thread store. It contains separate data for each
    // session. Features read `repository`; changes go through `updateRepository`
    // so validation and mutation happen within the same host storage update.
    let storage: ReturnType<typeof loadThreadRepository>
    try {
      storage = loadThreadRepository(opencode)
    } catch (error) {
      opencode.ui.toast.show({ message: error instanceof Error ? error.message : "Could not load saved Reply Threads data.", variant: "error", duration: 10000 })
      return
    }
    const { repository, updateRepository } = storage

    // Unlike the repository, this is temporary UI state: which comment should
    // the panel scroll to? A Solid signal is a getter/setter pair; reading
    // focusedThreadID() in JSX lets the component react when the setter runs.
    const [focusedThreadID, setFocusedThreadID] = createSignal<string | undefined>()

    /**
     * Opens our panel, optionally highlighting a comment clicked in the compact sidebar.
     *
     * @param threadID - Optional comment to scroll to; omit to open the panel at the top.
     * @returns Nothing; opens the host panel and updates the focused-thread signal.
     */
    const openThreadsPanel = (threadID?: string) => {
      setFocusedThreadID(threadID)
      opencode.ui.panel.open(THREAD_PANEL)
    }

    /**
     * Resolves the session from the current route so actions never use a stale session ID.
     *
     * @returns The routed session ID, or undefined outside a session.
     */
    const getCurrentSessionID = () => {
      const route = opencode.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    // 2. Create the feature services once for this plugin instance. Each service
    // returns actions (save/send/clear) and, where needed, reactive UI state.
    // Pass the session getter itself: features must look up the current session
    // when an action runs, rather than remembering the session open at startup.
    const sharedFeatureInputs = {
      context: opencode,
      state: repository,
      updateState: updateRepository,
      activeSessionID: getCurrentSessionID,
    }
    const annotationWorkflow = createAnnotationWorkflow({
      ...sharedFeatureInputs,
      // Clear the highlighted card/scroll target, not the host's keyboard focus.
      clearPanelFocus: () => setFocusedThreadID(undefined),
    })
    const sendWorkflow = createSendWorkflow(sharedFeatureInputs)
    const threadActions = createThreadActions(sharedFeatureInputs)

    /**
     * Handles the toolbar's fire-and-forget Send action and reports unexpected errors.
     * Expected admission failures are already handled inside the send feature.
     *
     * @returns Nothing; the send feature runs asynchronously and errors become toasts.
     */
    const sendPendingRepliesFromToolbar = () => {
      void sendWorkflow.send().catch((error) => {
        opencode.ui.toast.show({
          message: `Could not send reply threads (${error instanceof Error ? error.message : "unknown error"}).`,
          variant: "error",
        })
      })
    }

    // 3. Contribute to four host "slots": named places where plugins may render.
    // Registering a slot returns a function that removes it, used during cleanup.
    //
    // The app slot renders nothing visible. It gives command registration the
    // host keymap provider required by beta-19271; registering straight in setup
    // throws on that build. Its effect resets Reply Mode when the route changes.
    const removeCommandSlot = opencode.ui.slot({
      append: "app",
      render: () => {
        // Keep targeted editor keys outside the panel's input scope. Saving
        // returns focus left, but later selections still need Enter to save.
        annotationWorkflow.registerEditorKeys()
        const currentSessionID = createMemo(getCurrentSessionID)
        createEffect(on(currentSessionID, annotationWorkflow.resetForSession))
        // commands.ts owns key/palette/slash definitions. These callbacks tell
        // it which feature action to invoke without moving feature logic here.
        registerCommands(opencode, repository, {
          activeSessionID: getCurrentSessionID,
          openPanel: openThreadsPanel,
          isAnnotating: annotationWorkflow.isAnnotating,
          enterSends: annotationWorkflow.enterSends,
          commentOnSelection: annotationWorkflow.commentOnSelection,
          handleReplyModeShortcut: annotationWorkflow.handleReplyModeShortcut,
          send: sendWorkflow.send,
          reconcile: sendWorkflow.reconcile,
          clear: threadActions.clear,
        })
        return null
      },
    })
    // Above the prompt: Reply Mode, Send, pending previews and shortcut hints.
    const removeComposerToolbar = opencode.ui.slot({
      append: "session.composer.top",
      render: ({ sessionID }) => (
        <ComposerToolbar
          sessionID={sessionID}
          state={repository}
          commentMode={annotationWorkflow.replyModeEnabled()}
          themeMode={opencode.themeMode}
          onToggleMode={annotationWorkflow.toggleReplyMode}
          onSend={sendPendingRepliesFromToolbar}
        />
      ),
    })
    // Full review panel: OpenCode owns its size/focus; ThreadPanel owns its contents.
    // All plugins see this slot, so Show restricts our content to our panel name.
    const removeThreadsPanel = opencode.ui.slot({
      append: "session.panel",
      render: (hostPanel) => (
        <Show when={hostPanel.name === THREAD_PANEL}>
          <ThreadPanel
            context={opencode}
            panel={hostPanel}
            state={repository}
            updateState={updateRepository}
            captureQuote={annotationWorkflow.quotedText()}
            captureInitialComment={annotationWorkflow.initialComment()}
            onSaveCapture={annotationWorkflow.saveComment}
            onCancelCapture={annotationWorkflow.cancelAnnotation}
            isSaving={annotationWorkflow.isSaving()}
            onEditorReady={annotationWorkflow.registerEditor}
            onEditPending={annotationWorkflow.editPendingThread}
            captureParentID={annotationWorkflow.parentThreadID()}
            onReplyTo={annotationWorkflow.replyToThread}
            focusThreadID={focusedThreadID()}
          />
        </Show>
      ),
    })
    // Native OpenCode sidebar: a compact thread list. Row clicks open the same
    // full panel, with the clicked thread ID selecting where it should scroll.
    const removeSidebarSummary = opencode.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <SidebarEntry context={opencode} sessionID={sessionID} state={repository} onOpen={openThreadsPanel} />,
    })

    // 4. Check unfinished sends immediately and again on host data events.
    // The send feature limits recovery to the current session and prevents overlap.
    const stopSendRecovery = sendWorkflow.startRecovery()

    // 5. OpenCode calls this returned function when unloading/reloading the plugin.
    // Stop selection/recovery listeners and remove every slot we registered.
    // Stored threads remain on disk; cleanup only removes this instance's wiring.
    return () => {
      annotationWorkflow.dispose()
      removeCommandSlot()
      removeComposerToolbar()
      removeThreadsPanel()
      removeSidebarSummary()
      stopSendRecovery()
    }
  },
})
