import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./smoke-opencode.py", import.meta.url))
const child = spawn(process.env.PYTHON ?? "python3", [script, ...process.argv.slice(2)], { stdio: "inherit" })
const interrupt = () => child.kill("SIGINT")
process.on("SIGINT", interrupt)
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code ?? 1))
  })
} catch (error) {
  console.error(`Could not start smoke tests: ${error.message}. Install Python 3 or set PYTHON.`)
  process.exitCode = 1
} finally {
  process.off("SIGINT", interrupt)
}
