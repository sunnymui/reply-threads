# Contribution guidance

Before changing code in this repository, read the nearest applicable README files:

1. Read the root [`README.md`](README.md) for end-user behavior, installation, usage, commands and known limitations.
2. For changes under `src/`, also read [`src/README.md`](src/README.md) for entrypoints, module boundaries, runtime dependencies and development conventions.
3. For changes under any deeper directory, look for a `README.md` in that directory and in each relevant parent directory. Read every README on the path that applies to the files being changed.
4. If a subdirectory contains its own README, treat it as the closest and most specific guidance for that subtree, while still following applicable guidance from parent READMEs.
5. When adding a new subdirectory or changing its architecture, add or update the closest README so future agents can understand that area before editing it.

Keep documentation aligned with the code. If a change alters behavior, installation, module boundaries, or host compatibility, update the appropriate nearest README in the same change.

Source READMEs should include a short "Related changes" section. Give concrete examples of
changes that may need edits in other files, name those files and explain why they are linked.
Mention the relevant tests when useful. Describe important change paths rather than listing
every import.

## Writing style

Write documentation and comments in plain, direct language. Explain what the code does,
where to find it and why important constraints exist.

- Use short sentences and familiar words.
- Give concrete instructions instead of abstract descriptions.
- Avoid filler, repeated explanations and unnecessary jargon. Explain technical terms when needed.
- Describe each file or function's actual job. Don't replace an explanation with phrases such
  as "owns the lifecycle" or "provides a boundary."
- Keep useful technical details, including API names, storage rules and host workarounds.
- Write meaningful JSDoc descriptions, parameters and returns; don't add boilerplate just to pass lint.

Apply this style to every README, other documentation and code comments, including JSDoc.
