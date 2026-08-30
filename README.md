# AgentAssembly

Secrets: each file that needs one documents it —
[`web/.env.example`](web/.env.example),
[`supabase/functions/.env.example`](supabase/functions/.env.example),
[`secrets/README.md`](secrets/README.md), and [`cli/README.md`](cli/README.md)
for the CLI's environment. Real values live outside the tree; the repo holds
placeholders only.

## Local rebuild & CI

CI ([`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml))
proves the Supabase stack rebuilds and boots from this repo alone. It runs on
every push and PR in two independent jobs the backend test suites plug into:

- **db** — installs the Supabase CLI, runs `supabase start` to boot the local
  stack from `supabase/config.toml`, then `supabase test db` to run the pgTAP
  suite under [`supabase/tests/`](supabase/tests/). As migrations and
  `supabase/seed.sql` land it becomes the full `supabase db reset` rebuild proof.
- **functions** — runs `deno check` on every edge function under
  `supabase/functions/` (none yet); the Deno function-test suite attaches here.

Reproduce CI locally (needs Docker + the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)):

```sh
supabase start    # boot the stack from repo config
supabase status   # verify services are healthy
supabase test db  # run the pgTAP suite
supabase stop     # tear down

# typecheck edge functions once any exist:
deno check supabase/functions/<name>/index.ts
```
