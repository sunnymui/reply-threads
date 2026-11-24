import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { RuleTester } from "oxlint/plugins-dev"
import jsdoc from "eslint-plugin-jsdoc"

RuleTester.describe = describe
RuleTester.it = it

const config = JSON.parse(readFileSync(new URL("../.oxlintrc.json", import.meta.url), "utf8"))
const rules = config.overrides.find((override) => override.files.includes("src/**/*.ts")).rules
const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } })
const complete = "/** Adds one to the supplied count.\n * @param count - Current count.\n * @returns The next count.\n */\nexport function next(count: number) { return count + 1 }"

const cases = {
  "require-jsdoc": {
    valid: [complete, "function privateHelper() {}", "/** Renders a card. */\nexport const Card = () => <box />"],
    invalid: ["export function missing() {}", "export const missing = () => 1", "export default function missing() {}"],
  },
  "require-description": {
    valid: [complete],
    invalid: ["/**\n * @param count - Current count.\n * @returns Next count.\n */\nexport function next(count: number) { return count + 1 }"],
  },
  "require-param": {
    valid: [complete],
    invalid: ["/** Adds one.\n * @returns Next count.\n */\nexport function next(count: number) { return count + 1 }"],
  },
  "require-param-description": {
    valid: [complete],
    invalid: ["/** Adds one.\n * @param count\n * @returns Next count.\n */\nexport function next(count: number) { return count + 1 }"],
  },
  "check-param-names": {
    valid: [complete],
    invalid: ["/** Adds one.\n * @param oldName - Current count.\n * @returns Next count.\n */\nexport function next(count: number) { return count + 1 }"],
  },
  "require-returns": {
    valid: [complete, "/** Clears the input.\n * @returns Nothing; clears the local buffer.\n */\nexport function clear(): void {}"],
    invalid: ["/** Returns a count. */\nexport function count() { return 1 }", "/** Clears the input. */\nexport function clear(): void {}"],
  },
  "require-returns-description": {
    valid: [complete],
    invalid: ["/** Returns a count.\n * @returns\n */\nexport function count() { return 1 }"],
  },
}

for (const [name, samples] of Object.entries(cases)) {
  const setting = rules[`jsdoc-full/${name}`]
  const options = Array.isArray(setting) ? setting.slice(1) : []
  tester.run(`jsdoc-full/${name}`, jsdoc.rules[name], {
    valid: samples.valid.map((code) => ({ code, options })),
    invalid: samples.invalid.map((code) => ({ code, options, errors: 1 })),
  })
}
