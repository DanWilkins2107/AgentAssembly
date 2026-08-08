# AgentAssembly Web

## Component hierarchy

- Page = `src/pages/<Page>/page.tsx`, named export `<Page>`.
- Everything else is an element: `<owner>/elements/<Name>.tsx`. PascalCase.
- An element that owns elements of its own becomes a folder: `<owner>/elements/<Name>/<Name>.tsx`, with its `elements/` beside it. Nesting has no depth limit.
- Owner = lowest common folder of the consumers.
- Applies to every module, not just components: hooks, contexts, clients, helpers.
- `<Name>.css`, `<Name>.test.tsx`, `<Name>.snapshot.test.tsx` and `__snapshots__/` sit beside the module.
- `src/` root holds `main.tsx`, `theme.css`, `vite-env.d.ts` and nothing else. Router wiring goes in `main.tsx` when it lands.
- Colour literals live only in `theme.css`; everything else uses `var(--…)`.

## Snapshot tests

Every component has a `<Name>.snapshot.test.tsx` beside it rendering its default state into a
committed snapshot; run `npx vitest -u` to update one after changing a component.
