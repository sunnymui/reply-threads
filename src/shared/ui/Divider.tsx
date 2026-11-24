import { EDITOR_COLORS } from "./colors.js"

/**
 * Renders the shared visual separator used between quoted context and annotation input. It
 * contains no annotation state or host integration.
 *
 * @returns A one-row top-border separator using shared UI colors.
 */
export function Divider() {
  return <box height={1} flexShrink={0} border={["top"]} borderStyle="single" borderColor={EDITOR_COLORS.divider} />
}
