# AgentAssembly CLI

Storage primitives for the CLI's configuration and session tokens.

## Configuration

```ts
import { env } from "agentassembly-cli/env";
```

One `AGENTJIRA_EMAIL` per process means one agent identity per process, so a CLI run can never
touch a project it was not launched for.

## Session tokens

```ts
import { getSession, setSession, clearSession } from "agentassembly-cli/session";
```

## Authenticated client

```ts
import { connect } from "agentassembly-cli/client";
```

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # vitest (Linux only — the suite throws on other platforms)
```
