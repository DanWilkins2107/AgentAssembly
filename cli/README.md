# AgentAssembly CLI

Storage primitives for the CLI's password and session tokens.

## Password

`AGENTJIRA_PASSWORD` is injected by the runtime and validated in `src/env.ts`. Read it off the
Zod-parsed env object; it is never written to disk.

```ts
import { env } from "agentassembly-cli/env";

env.AGENTJIRA_PASSWORD; // string | undefined
```

## Session tokens

Session tokens are minted at sign-in (not env-injected), so they are cached in
`~/.agentjira/session.json`, created `0600` inside a `0700` directory. See `src/session.ts` for the
`getSession` / `setSession` / `clearSession` API and its behaviour.

```ts
import { getSession, setSession, clearSession } from "agentassembly-cli/session";
```

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # build + run the suite on Linux in Docker (perm tests always run)
npm run test:unit   # raw vitest (fast local loop; skips the POSIX-perm tests on Windows)
```
