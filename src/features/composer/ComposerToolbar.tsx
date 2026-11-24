import { ToolbarButton } from "./ToolbarButton.js"
import type { ThreadRepositoryState } from "../threads/data/thread-types.js"
import { pendingThreads } from "../threads/data/thread-repository.js"
import { createSignal } from "solid-js"

/**
 * Renders the composer feature’s prompt toolbar, pending-comment previews and shortcut hints.
 * The app mounts it in session.composer.top and supplies annotation/send callbacks; this
 * component owns presentation rather than those workflows.
 *
 * @param props - Composer session/repository view, Reply Mode/theme state and app-supplied
 *   toggle/send actions.
 * @returns The composer toolbar, pending preview and reserved hover-hint row.
 */
export function ComposerToolbar(props: {
  sessionID: string
  state: ThreadRepositoryState
  commentMode: boolean
  themeMode?: "dark" | "light"
  onToggleMode: () => void
  onSend: () => void
}) {
  /**
   * Counts the session’s pending comments to control Send visibility and Enter-to-send guidance.
   *
   * @returns The number of pending comments in the composer session.
   */
  const count = () => pendingThreads(props.state, props.sessionID).length
  /**
   * Selects pending comments for the composer preview from the session’s thread repository.
   *
   * @returns The pending threads for this surface’s session.
   */
  const pending = () => pendingThreads(props.state, props.sessionID)
  const [replyHovered, setReplyHovered] = createSignal(false)
  return (
    <box flexDirection="column" paddingLeft={1} flexShrink={0}>
      <box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={0}>
        <ToolbarButton label="Reply Mode" active={props.commentMode} light={props.themeMode === "light"} onPress={props.onToggleMode} onHover={setReplyHovered} />
        {count() > 0 ? <ToolbarButton label="Send pending replies" light={props.themeMode === "light"} onPress={props.onSend} /> : null}
        <text selectable={false} fg={props.themeMode === "light" ? "#526078" : "#8993a8"}>
          {props.commentMode ? (count() > 0 ? "Enter sends (empty prompt) · Ctrl+Y exits · Ctrl+L threads" : "Ctrl+Y exits · Ctrl+L threads") : "Ctrl+Y reply mode · Ctrl+L threads"}
        </text>
      </box>
      {pending().length > 0 ? (
        <box flexDirection="column" paddingTop={1} paddingBottom={1}>
          {pending().slice(0, 3).map((thread, index) => (
            <text selectable={false} fg={props.themeMode === "light" ? "#526078" : "#8993a8"}>
              {`${thread.label ?? index + 1}. “${thread.quote.raw.replace(/\s+/g, " ").slice(0, 72)}${thread.quote.raw.length > 72 ? "…" : ""}” — ${thread.comment.replace(/\s+/g, " ").slice(0, 72)}${thread.comment.length > 72 ? "…" : ""}`}
            </text>
          ))}
          {pending().length > 3 ? <text selectable={false} fg={props.themeMode === "light" ? "#526078" : "#8993a8"}>{`…and ${pending().length - 3} more in Threads`}</text> : null}
        </box>
      ) : null}
      <text height={1} flexShrink={0} selectable={false} wrapMode="none" truncate fg={props.themeMode === "light" ? "#526078" : "#8993a8"}>
        {replyHovered() ? props.commentMode
          ? "Select part(s) of the chat response to annotate/reply. Click Reply Mode or Ctrl+Y to exit."
          : "Enter Reply Mode (Ctrl+Y), then select part(s) of the chat response to annotate/reply."
          : ""}
      </text>
    </box>
  )
}
