# AgentAssembly CLI

Storage primitives for the CLI's configuration and session tokens.

## Configuration

All CLI settings are env vars, validated in `src/env.ts` when the module is first imported — a
missing or malformed value fails at startup, not mid-command. Nothing is read from a config file.

```ts
import { env } from "agentassembly-cli/env";
```

`AGENTJIRA_URL`, `AGENTJIRA_ANON_KEY`, `AGENTJIRA_EMAIL` and `AGENTJIRA_PASSWORD` are all required,
so a missing one fails at startup rather than at the first sign-in. The password is never written to
disk.

One `AGENTJIRA_EMAIL` per process means one agent identity per process, so a CLI run can never
touch a project it was not launched for.

## Session tokens

Session tokens are minted at sign-in (not env-injected), so they are cached in
`~/.agentjira/session.json`, created `0600` inside a `0700` directory. See `src/session.ts` for the
`getSession` / `setSession` / `clearSession` API and its behaviour.

```ts
import { getSession, setSession, clearSession } from "agentassembly-cli/session";
```

## Authenticated client

`connect()` in `src/client.ts` returns a signed-in Supabase client: it resumes the cached session
when there is one (supabase-js refreshes the access token and the rotated pair is written back), and
otherwise signs in with `AGENTJIRA_PASSWORD`. Either failure clears the cached session and throws an
`AuthError` — there is no fallback from a failed refresh to a password sign-in. supabase-js keeps no
state of its own, so `session.json` stays the only thing on disk.

```ts
import { connect } from "agentassembly-cli/client";
```

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # vitest (Linux only — the suite throws on other platforms)
```
