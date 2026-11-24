import type { ThreadRepositoryState } from "./thread-types.js"

/**
 * Threads-owned persistence boundary passed by app/TuiPlugin.tsx to feature workflows.
 * Validate and mutate inside the callback; the host persists the resulting repository draft.
 *
 * @param mutation - Synchronous change applied within one host storage update.
 * @returns A promise resolving after the host completes the repository write.
 */
export type UpdateRepository = (mutation: (draft: ThreadRepositoryState) => void) => Promise<void>
