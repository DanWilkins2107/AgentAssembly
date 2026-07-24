# AgentAssembly

Secrets & environment design: [docs/secrets.md](docs/secrets.md)

## Local rebuild & CI

CI ([`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml))
proves the Supabase stack rebuilds and boots from this repo alone. It runs on
every push and PR in two independent jobs the backend test suites plug into:

- **db** — installs the Supabase CLI and runs `supabase start`, booting the
  local stack from `supabase/config.toml`. As migrations and `supabase/seed.sql`
  land it becomes the full `supabase db reset` rebuild proof; the pgTAP suite
  attaches here.
- **functions** — runs `deno check` on every edge function under
  `supabase/functions/` (none yet); the Deno function-test suite attaches here.

Reproduce CI locally (needs Docker + the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)):

```sh
supabase start    # boot the stack from repo config
supabase status   # verify services are healthy
supabase stop     # tear down

# typecheck edge functions once any exist:
deno check supabase/functions/<name>/index.ts
```
