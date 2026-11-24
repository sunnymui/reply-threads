import type { Context } from "@opencode/plugin/tui/context"
import { initialRepositoryState, type ThreadRepositoryState } from "./data/thread-types.js"
import { validateRepository } from "./data/validate-repository.js"
import type { UpdateRepository } from "./data/workflow-types.js"

// The host exposes a reactive proxy with symbol metadata. Validate the JSON
// that can actually be persisted, not the proxy's non-JSON implementation keys.
const validateStorageSnapshot = (value: unknown) => validateRepository(JSON.parse(JSON.stringify(value)) as unknown)

/**
 * Opens the live repository through one load/validation boundary. Invalid or unsupported data
 * stops loading before any write; the only legacy normalization is a missing revision counter.
 *
 * @param context - Host storage API used to load and transactionally update the repository.
 * @returns The validated live repository and a writer that checks drafts before and after mutation.
 */
export function loadThreadRepository(context: Pick<Context, "storage">): {
  repository: ThreadRepositoryState
  updateRepository: UpdateRepository
} {
  const [repository, writeRepository] = context.storage.store("repository", { initial: initialRepositoryState() })
  const validated = validateStorageSnapshot(repository)
  // Match the existing bootstrap's local revision default. Persist it inside
  // the next host transaction; do not make plugin setup asynchronous for it.
  if (repository.revision === undefined) repository.revision = validated.revision
  const updateRepository: UpdateRepository = (mutation) => writeRepository((draft) => {
    const current = validateStorageSnapshot(draft)
    if (draft.revision === undefined) draft.revision = current.revision
    mutation(draft)
    validateStorageSnapshot(draft)
  })
  return { repository, updateRepository }
}
