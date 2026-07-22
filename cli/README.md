# AgentAssembly CLI

## SecretStore

The single path through which the CLI reads and writes sensitive values.

```ts
import { createSecretStore } from "agentassembly-cli";

const store = createSecretStore(); // defaults to ~/.agentjira
```

| Member | Behaviour |
| --- | --- |
| `getPassword()` | Returns `AGENTJIRA_PASSWORD` from the environment, or `null` when unset. The password is never written to disk and has no setter. |
| `getSession()` | Returns the cached `{ access_token, refresh_token }` bundle, or `null` when none is stored. |
| `setSession(bundle)` | Writes the bundle to `~/.agentjira/session.json`. |
| `clearSession()` | Removes the file; a no-op when nothing is stored. |

Missing values return `null` rather than throwing. A real IO failure, or a session file that is
corrupt, throws `SecretStoreError`; error messages carry the file path only, never token or
password values.

The session file is created with mode `0600` inside a `0700` directory — permissions are applied at
create time, so the tokens are never on disk under looser permissions. Writes go to a `0600`
temporary file in the same directory and are then renamed into place, so a failed write cannot
leave a partial session behind. Non-secret config (`url`, `anon_key`, `email`) does not belong in
the store.

Permissions target POSIX; the two permission tests are skipped on Windows.

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # vitest run
```
