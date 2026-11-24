import { parse } from "comment-parser"
import { areDocsInformative } from "are-docs-informative"

/** Project-specific checks for the host constraints and component conventions in src/README.md. */
const filenameOf = (context) => context.filename.replaceAll("\\", "/")
const isRuntimeSource = (filename) => /(?:^|\/)src\//.test(filename) && !/\.test\.[cm]?[jt]sx?$/.test(filename)
const propertyName = (node) => node?.type === "Identifier" ? node.name : node?.value

// The upstream informative-docs visitor does not report our negative fixtures
// through Oxlint 1.88's JS-plugin bridge. Use the same parser/scoring libraries
// with explicit function visitors and comment attachment instead.
const informativeFunctionDocs = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { redundant: "This JSDoc description only repeats the name it describes; explain its purpose or behavior." },
  },
  create(context) {
    const inspect = (node) => {
      let attached = node
      let name = node.id?.name
      if (node.parent.type === "VariableDeclarator") {
        name = node.parent.id.name
        attached = node.parent.parent
      } else if (node.parent.type === "Property") {
        name = propertyName(node.parent.key)
        attached = node.parent
      }
      if (!name) return
      if (["ExportNamedDeclaration", "ExportDefaultDeclaration"].includes(attached.parent.type)) attached = attached.parent
      const comment = context.sourceCode.getCommentsBefore(attached).at(-1)
      if (comment?.type !== "Block" || !comment.value.startsWith("*")) return
      const [doc] = parse(context.sourceCode.getText(comment))
      if (!doc) return
      const redundant = (description, extraName = "") => description.trim() && !areDocsInformative(description, `${name} ${extraName}`, {
        aliases: { a: ["an", "our"] },
        uselessWords: ["a", "an", "i", "in", "of", "s", "the"],
      })
      if (redundant(doc.description)) context.report({ loc: comment.loc, messageId: "redundant" })
      for (const tag of doc.tags) {
        if (["param", "returns", "return"].includes(tag.tag) && redundant(tag.description, tag.name)) {
          context.report({ loc: comment.loc, messageId: "redundant" })
        }
      }
    }
    return { FunctionDeclaration: inspect, FunctionExpression: inspect, ArrowFunctionExpression: inspect }
  },
}

const isKeymapLayerCall = (node) => node?.type === "CallExpression"
  && node.callee.type === "MemberExpression" && propertyName(node.callee.property) === "layer"
  && (node.callee.object.type === "Identifier" ? node.callee.object.name === "keymap"
    : node.callee.object.type === "MemberExpression" && propertyName(node.callee.object.property) === "keymap")

/** Rejects direct setup-time registrations, while allowing deferred slot/component callbacks. */
const setupKeymapScope = {
  meta: {
    type: "problem",
    schema: [],
    messages: { setup: "Register keymap layers from a mounted slot/component, not directly in Plugin.define setup; beta-19271 has no Keymap.Provider there." },
  },
  create(context) {
    if (!isRuntimeSource(filenameOf(context))) return {}
    const pluginNames = new Set(["Plugin"])
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "@opencode/plugin/tui") return
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && propertyName(specifier.imported) === "Plugin") pluginNames.add(specifier.local.name)
        }
      },
      CallExpression(node) {
        if (!isKeymapLayerCall(node)) return
        const ancestors = context.sourceCode.getAncestors(node)
        for (const ancestor of ancestors.toReversed()) {
          if (!["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"].includes(ancestor.type)) continue
          const parent = ancestor.parent
          // An immediately invoked function still executes during setup.
          if (parent.type === "CallExpression" && parent.callee === ancestor) continue
          if (parent.type !== "Property" || propertyName(parent.key) !== "setup") return
          const definition = parent.parent?.parent
          const callee = definition?.type === "CallExpression" ? definition.callee : undefined
          if (callee?.type === "MemberExpression" && propertyName(callee.property) === "define"
            && callee.object.type === "Identifier" && pluginNames.has(callee.object.name)) {
            context.report({ node, messageId: "setup" })
          }
          return
        }
      },
    }
  },
}

/** Keeps recent-window cache reads out of review presentation; complete history owns that boundary. */
const reviewHistorySource = {
  meta: {
    type: "problem",
    schema: [],
    messages: { history: "Use createReviewHistory in review UI; direct message-cache reads can hide intact older answers after a rebuild." },
  },
  create(context) {
    const filename = filenameOf(context)
    if (!isRuntimeSource(filename) || !/\/features\/(?:threads\/(?:panel|sidebar)\/|replies\/[A-Z][^/]*\.tsx$)/.test(filename)) return {}
    const namespaces = new Set()
    const isHistoryHelper = (source) => /(?:^|\/)opencode-helpers\/message-history(?:\.[cm]?[jt]s)?$/.test(source)
    return {
      ImportDeclaration(node) {
        if (!isHistoryHelper(node.source.value)) return
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name)
          else if (specifier.type === "ImportSpecifier" && propertyName(specifier.imported) === "cachedHistory") context.report({ node: specifier, messageId: "history" })
        }
      },
      MemberExpression(node) {
        const name = propertyName(node.property)
        if (name === "cachedHistory" && node.object.type === "Identifier" && namespaces.has(node.object.name)) {
          context.report({ node, messageId: "history" })
        } else if (name === "message" && node.object.type === "MemberExpression" && propertyName(node.object.property) === "session"
          && node.object.object.type === "MemberExpression" && propertyName(node.object.object.property) === "data") {
          context.report({ node, messageId: "history" })
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init?.type !== "Identifier" || !namespaces.has(node.init.name)) return
        for (const property of node.id.properties) {
          if (property.type === "Property" && propertyName(property.key) === "cachedHistory") context.report({ node: property, messageId: "history" })
        }
      },
    }
  },
}

/** Adjacent function doc blocks are accidental unless one explicitly documents the module/file. */
const adjacentJsdoc = {
  meta: {
    type: "problem",
    schema: [],
    messages: { duplicate: "Merge adjacent JSDoc blocks into one function comment, or mark a separate overview with @file or @module." },
  },
  create(context) {
    if (!isRuntimeSource(filenameOf(context))) return {}
    return {
      Program() {
        const comments = context.sourceCode.getAllComments().filter((comment) => comment.type === "Block" && comment.value.startsWith("*"))
        for (let index = 1; index < comments.length; index++) {
          const previous = comments[index - 1]
          const current = comments[index]
          const overview = /(?:^|\n)\s*\*?\s*@(?:file(?:overview)?|module)\b/
          if (overview.test(previous.value) || overview.test(current.value)) continue
          if (!context.sourceCode.text.slice(previous.range[1], current.range[0]).trim()) context.report({ loc: current.loc, messageId: "duplicate" })
        }
      },
    }
  },
}

/**
 * Prevents annotation save bindings from being registered in a panel-owned input scope.
 * Such bindings stop working after the first save returns host focus to the prompt.
 */
const annotationEnterScope = {
  meta: {
    type: "problem",
    schema: [],
    messages: { scope: "Register annotation Enter bindings from the app slot through annotationWorkflow.registerEditorKeys(), not inside the panel/editor scope." },
  },
  create(context) {
    const filename = filenameOf(context)
    if (!isRuntimeSource(filename) || !/\/features\/(?:annotate\/editor|threads\/panel)\//.test(filename)) return {}
    return {
      Property(node) {
        if (propertyName(node.key) !== "bind" || typeof node.value.value !== "string") return
        if (!node.value.value.split(",").some((binding) => /^(?:return|enter|kpenter)$/.test(binding.trim()))) return
        const inKeymapLayer = context.sourceCode.getAncestors(node).some((ancestor) => {
          const callee = ancestor.type === "CallExpression" ? ancestor.callee : undefined
          return callee?.type === "MemberExpression" && propertyName(callee.property) === "layer"
            && callee.object.type === "MemberExpression" && propertyName(callee.object.property) === "keymap"
        })
        if (inKeymapLayer) context.report({ node, messageId: "scope" })
      },
    }
  },
}

/** Preserves the .tsx host-loader workaround for runtime modules that create Solid state. */
const reactiveModuleExtension = {
  meta: {
    type: "problem",
    schema: [],
    messages: { extension: "Keep signal-owning runtime modules as .tsx on beta-19271; .ts extraction broke live reactivity. See docs/compatibility.md." },
  },
  create(context) {
    const filename = filenameOf(context)
    if (!isRuntimeSource(filename) || !filename.endsWith(".ts")) return {}
    const primitives = new Set(["createSignal", "createMemo", "createStore", "createMutable"])
    const locals = new Set()
    const namespaces = new Set()
    return {
      ImportDeclaration(node) {
        if (!["solid-js", "solid-js/store"].includes(node.source.value) || node.importKind === "type") return
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name)
          else if (specifier.type === "ImportSpecifier" && primitives.has(propertyName(specifier.imported))) locals.add(specifier.local.name)
        }
      },
      CallExpression(node) {
        const callee = node.callee
        const createsState = callee.type === "Identifier" ? locals.has(callee.name)
          : callee.type === "MemberExpression" && callee.object.type === "Identifier"
            && namespaces.has(callee.object.name) && primitives.has(propertyName(callee.property))
        if (createsState) context.report({ node, messageId: "extension" })
      },
    }
  },
}

/** Keeps exported PascalCase components discoverable by their matching filename. */
const componentFilename = {
  meta: {
    type: "problem",
    schema: [],
    messages: { filename: "Exported component {{name}} belongs in {{name}}.tsx, not {{filename}}." },
  },
  create(context) {
    const filename = filenameOf(context)
    if (!isRuntimeSource(filename) || !filename.endsWith(".tsx")) return {}
    const basename = filename.slice(filename.lastIndexOf("/") + 1)
    const check = (node, name) => {
      if (name && /^[A-Z]/.test(name) && basename !== `${name}.tsx`) {
        context.report({ node, messageId: "filename", data: { name, filename: basename } })
      }
    }
    const checkExport = (node) => {
      const declaration = node.declaration
      if (declaration?.type === "FunctionDeclaration") check(declaration, declaration.id?.name)
      else if (declaration?.type === "VariableDeclaration") {
        for (const variable of declaration.declarations) {
          if (variable.id.type === "Identifier" && ["ArrowFunctionExpression", "FunctionExpression"].includes(variable.init?.type)) check(variable, variable.id.name)
        }
      }
    }
    return { ExportNamedDeclaration: checkExport, ExportDefaultDeclaration: checkExport }
  },
}

export default {
  meta: { name: "reply-threads" },
  rules: {
    "annotation-enter-scope": annotationEnterScope,
    "reactive-module-extension": reactiveModuleExtension,
    "component-filename": componentFilename,
    "setup-keymap-scope": setupKeymapScope,
    "review-history-source": reviewHistorySource,
    "no-adjacent-jsdoc": adjacentJsdoc,
    "informative-function-docs": informativeFunctionDocs,
    "message-pagination-options": {
      meta: {
        type: "problem",
        schema: [],
        messages: { pagination: "Message cursors already encode ordering. Send order on the first page, then cursor without order on later pages." },
      },
      create(context) {
        if (!isRuntimeSource(filenameOf(context))) return {}
        return {
          CallExpression(node) {
            const callee = node.callee
            if (callee.type !== "MemberExpression" || propertyName(callee.property) !== "list"
              || callee.object.type !== "MemberExpression" || propertyName(callee.object.property) !== "message") return
            const options = node.arguments[0]
            if (options?.type !== "ObjectExpression") return
            const keys = options.properties.filter((property) => property.type === "Property").map((property) => propertyName(property.key))
            if (keys.includes("cursor") && keys.includes("order")) context.report({ node: options, messageId: "pagination" })
          },
        }
      },
    },
  },
}
