# Secrets & environment — target design

Target design for how AgentAssembly handles secrets and environment
configuration, and the input contract that **Production provisioning & deploy
flow** consumes when standing the system up online.

Where a file already defines a secret, that file is the detail. This document is
the cross-cutting map — one home per secret, how sensitive it is, and where it
must never appear — and does not restate what the file says.

## Core principle

> The repo tree may contain only **placeholders**, **throwaway local-only
> fixtures**, and **pointers**. Every real secret lives in exactly **one vault
> outside the tree** — the user's home directory, Supabase secret storage, or
> GitHub Actions secrets. "Nothing real is committed" is **machine-enforced, not
> asserted** (a CI secret-scan gate — see *CI enforcement* below).

Four rules follow from it:

1. **One home per secret.** Every secret has exactly one authoritative location.
   Anywhere else that needs it *references* that home; it never re-stores the
   value.
2. **The tree holds no real secret.** Committed files carry placeholders,
   deliberately-weak local-only fixtures, or documentation — never a value that
   is valid against a hosted project.
3. **Server secrets never reach a browser or the repo.** Anything that bypasses
   RLS or signs credentials lives only server-side (Edge Function secrets) and is
   platform-injected, never pasted into a committed file.
4. **"Nothing committed" is enforced by a machine, not by convention.** A CI
   secret-scan gate fails the build on any finding, with a tight allowlist for
   exactly the intentional local-only fixtures. (Delivered in a follow-up PR —
   see *CI enforcement*.)

## The secrets

| Tier | Secret | Home | Sensitivity | Must never appear in |
|---|---|---|---|---|
| Public | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `web/.env` locally (from `web/.env.example`); build env in hosting | Public **by design** — RLS is the gate, not obscurity | — |
| Server-secret | `SUPABASE_SERVICE_ROLE_KEY` | platform-injected by Supabase into Edge Functions; read by `github-sync` only | **High** — bypasses RLS | web bundle, CLI, any repo file |
| Server-secret | `GITHUB_APP_ID` | `github-token` Function secret (from `supabase/functions/.env.example`); hosted via `supabase secrets set` | Low | web bundle, CLI |
| Server-secret | `GITHUB_APP_PRIVATE_KEY` | same; local PEM source is `secrets/envkey.pem` (gitignored — see `secrets/README.md`) | **High** — signs the app JWT | any committed file |
| CI | `AGENTJIRA_SYNC_URL` | GHA repo secret | Low — the `github-sync` function URL | repo `.env` |
| CI | `AGENTJIRA_SECRET` | GHA repo secret; **mirror** of the project's `webhook_secret` | **Sensitive** | repo `.env` |
| Shared-secret | per-project `webhook_secret` | the `projects` Postgres row (`encode(gen_random_bytes(32), 'hex')`); read by the web owner UI and `github-sync` | **Sensitive** | any repo `.env` |
| Agent CLI | `AGENTJIRA_URL`, `AGENTJIRA_ANON_KEY`, `AGENTJIRA_EMAIL`, `AGENTJIRA_PASSWORD` | env vars only — see `cli/README.md` | `EMAIL` / `PASSWORD` **Sensitive**; rest Low | repo tree, any file on disk |
| Agent CLI | session token | `~/.agentjira/session.json` — see `cli/README.md` | **Sensitive** | repo tree |

The `github-sync` function needs **no repo-side secret file**: its only secret is
the platform-injected service-role key.

`webhook_secret` has one home, the DB row; the GHA secret is a **mirror**, never a
second source of truth. It appears in **no** repo `.env` file.

**Deliberate design decision: there is no `cli/.env.example`, and the CLI loads
no `.env` file.** CLI credentials belong in the process environment, not the repo
tree. Adding a `cli/.env.example` would invite users to create a `cli/.env`
inside the repo — exactly the pattern this design forbids.

## Local-dev-only fixtures (intentionally committed)

`supabase/seed.sql` does not exist yet. When it lands it carries a dev password
and a dev `webhook_secret` that are committed **on purpose**, are deliberately
weak, and are **never valid anywhere hosted**.

Design boundary: **`seed.sql` never runs against a hosted project.** Its weak
values are acceptable precisely because they are local-only.

## CI enforcement

Rule #4 is made real by a CI secret-scan gate — a `secret-scan` workflow running
gitleaks (or trufflehog) on push and pull_request, scanning the working tree and
full git history and **failing the build on any finding**, with a tightly-scoped
`.gitleaks.toml` allowlist covering **only** the intentional local-only fixtures
above (the seed.sql dev password + dev `webhook_secret`, and the `*.env.example`
placeholder lines). **This gate is delivered in its own follow-up PR** (split out
of this design PR at the operator's request); the allowlist is finalized there,
once `supabase/seed.sql` exists.

## Known gaps — owned elsewhere, NOT fixed here

These are catalogued for completeness and are **out of scope** for this design.
They belong to the **Security hardening & safe-to-run-online** / **Authentication**
workstreams:

- **`webhook_secret` agent-role non-exposure is a convention only** — the web
  (owner) UI reads it and the CLI never selects it, but this is not DB-enforced
  (no column-privilege revoke or restricted view). Rationale: enforcing it at the
  DB layer is a hardening step owned by the security workstream.
- **seed.sql weak dev password + dev `webhook_secret`** are weak but local-only
  by design and acceptable as-is; the only real risk is that `seed.sql` must never
  touch a hosted project.
- **v0 left a plaintext `~/.agentjira/config.json`** on machines that ran it.
  AgentAssembly never reads, writes or removes it — the file is the user's to
  delete once v0 is retired.

## Cross-references

- `README.md` links here.
- `docs/architecture.md` §Security should link here once that document exists
  (owned by a separate node); this design is the authoritative source for the
  "secrets" non-negotiable.
