# AgentAssembly Web

## Snapshot tests

Every component under `src/` has a `src/<Name>.snapshot.test.tsx` rendering its default state into a
committed snapshot; run `npx vitest -u` to update one after changing a component.
