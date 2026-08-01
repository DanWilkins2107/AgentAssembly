# AgentAssembly CLI

Storage primitives for the CLI's configuration and session tokens.

## Configuration

All CLI settings are env vars, validated in `src/env.ts` when the module is first imported — a
missing or malformed value fails at startup, not mid-command. Nothing is read from a config file.

```ts
import { env } from "agentassembly-cli/env";
```

`AGENTJIRA_URL`, `AGENTJIRA_ANON_KEY` and `AGENTJIRA_EMAIL` are required. `AGENTJIRA_PASSWORD` is
optional (a cached session covers most commands) and is never written to disk.

One `AGENTJIRA_EMAIL` per process means one agent identity per process, so a CLI run can never
touch a project it was not launched for.

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
npm test            # vitest (Linux only — the suite throws on other platforms)
```
