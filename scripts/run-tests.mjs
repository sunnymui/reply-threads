import { readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const root = resolve(import.meta.dirname, "..")
const ui = process.argv[2] === "ui"
const suffix = ui ? ".test.tsx" : ".test.ts"

/** Discover colocated tests without depending on shell-specific recursive glob expansion. */
function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory() ? discover(file) : file.endsWith(suffix) ? [file] : []
  })
}

const files = discover(join(root, "src")).sort()
if (files.length === 0) throw new Error(`No ${suffix} files found`)
console.log(`Running ${files.length} colocated ${ui ? "UI" : "domain and workflow"} test files`)
const args = ui
  ? ["test", "--preload", "@opentui/solid/preload", ...files]
  : ["--import", "tsx", "--test", ...files]
const result = spawnSync(ui ? "bun" : process.execPath, args, { cwd: root, stdio: "inherit" })
if (result.error) throw result.error
process.exit(result.status ?? 1)
