# AgentAssembly CLI

## Environment

`src/env.ts` validates and exposes the process environment through a Zod schema. The password lives
here — there is no separate accessor:

```ts
import { env } from "agentassembly-cli/env";

env.AGENTJIRA_PASSWORD; // string | undefined
```

`AGENTJIRA_PASSWORD` is injected by the runtime and is never written to disk.

## Session persistence

Session tokens are minted when the CLI signs in, so they cannot come from the environment. They are
cached in `~/.agentjira/session.json`:

```ts
import { getSession, setSession, clearSession } from "agentassembly-cli/session";
```

| Function | Behaviour |
| --- | --- |
| `getSession()` | Returns the cached `{ access_token, refresh_token }` bundle, or `null` when none is stored. |
| `setSession(bundle)` | Writes the bundle to `~/.agentjira/session.json`. |
| `clearSession()` | Removes the file; a no-op when nothing is stored. |

Each function accepts an optional directory argument (defaulting to `~/.agentjira`) used by the
tests.

A missing session returns `null`. A real IO failure, or a session file that is corrupt, throws
`SessionError`; error messages carry the file path only, never token values.

The file is created with mode `0600` inside a `0700` directory — permissions are applied at create
time, so the tokens are never on disk under looser permissions. Writes go to a `0600` temporary file
in the same directory and are then renamed into place, so a failed write cannot leave a partial
session behind.

Permissions target POSIX; the two permission tests are skipped on Windows.

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # vitest run
```
