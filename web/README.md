# AgentAssembly Web

## Component hierarchy

- Page = `src/pages/<Page>/page.tsx`, named export `<Page>`.
- Everything else is an element: `<owner>/elements/<Name>.tsx`. PascalCase.
- An element that owns elements of its own becomes a folder: `<owner>/elements/<Name>/<Name>.tsx`, with its `elements/` beside it. Nesting has no depth limit.
- Owner = lowest common folder of the consumers.
- Applies to every module, not just components: hooks, contexts, clients, helpers.
- `<Name>.css`, `<Name>.test.tsx`, `<Name>.snapshot.test.tsx` and `__snapshots__/` sit beside the module.
- `src/` root holds `main.tsx`, `theme.css`, `vite-env.d.ts` and, when something is shared across pages, its own `elements/`. Router wiring goes in `main.tsx` when it lands.
- Colour literals live only in `theme.css`; everything else uses `var(--…)`.
- A module imports only its own sibling `<Name>.css` (`main.tsx` -> `theme.css` is the one exception), and every classname a stylesheet declares must be used.

## Temporary excludes

An element that lands before its consumer has no consumers, so the owner gate fails it.
`TEMPORARY_EXCLUDES` in `tests/lowest-common-folder.test.ts` suppresses that one rule, and
only for the listed path. Each entry needs the AgentJira node id of the consumer that will
land, an expiry no more than 5 days out, and a reason.

Entries expire hard, and go stale the moment the path gains a consumer or disappears — both
turn the suite red. When that happens, check the named node, then bump the expiry if the
consumer is still coming or delete the entry if it isn't.

## Snapshot tests

Every component has a `<Name>.snapshot.test.tsx` beside it rendering its default state into a
committed snapshot; run `npx vitest -u` to update one after changing a component.
