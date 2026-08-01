# Secrets & environment — target design

This is the **canonical target design** for how AgentAssembly handles secrets and
environment configuration. It describes the structure the rebuilt system conforms
to — not a snapshot of any current tree — and is the input contract that
**Production provisioning & deploy flow** consumes when standing the system up
online.

## Core principle

> The repo tree may contain only **placeholders**, **throwaway local-only
> fixtures**, and **pointers**. Every real secret lives in exactly **one vault
> outside the tree** — the user's home directory, Supabase secret storage, or
> GitHub Actions secrets. "Nothing real is committed" is **machine-enforced, not
> asserted** (a CI secret-scan gate — see *CI enforcement* below).

Four rules follow from it:

1. **One canonical home per secret.** Every secret has exactly one authoritative
   location. Anywhere else that needs it *references* that home; it never
   re-stores the value.
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

## The five trust tiers

### 1. Public tier

Safe in a browser bundle and safe as a committed placeholder. Public **by
design** — Row Level Security is the real gate, not obscurity of these values.

| Secret | Home | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `web/.env` locally (from `web/.env.example`); build env in hosting | Project API URL. |
| `VITE_SUPABASE_ANON_KEY` | same | Anon key. Public by design; RLS enforces access. Not a leak. |

### 2. Server-secret tier

Must **never** reach a browser or the repo. Platform-injected locally and hosted.

| Secret | Home | Sensitivity | Must never appear in |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase into Edge Functions (`github-sync`) locally and hosted | **High** — bypasses RLS | web bundle, CLI, any repo file |
| `GITHUB_APP_ID` | `github-token` Function secret: local `supabase/functions/.env`; hosted via `supabase secrets set` | Low | web bundle, CLI |
| `GITHUB_APP_PRIVATE_KEY` | same; local PEM source is `secrets/envkey.pem` (gitignored) | **High** — signs the app JWT | any committed file |

Local PEM source of truth: **`secrets/envkey.pem`** (gitignored — see
`secrets/README.md`). The `github-sync` function needs **no repo-side secret
file**: its only secret is the platform-injected service-role key.

### 3. CI tier — GitHub Actions repo secrets

| Secret | Home | Sensitivity |
|---|---|---|
| `AGENTJIRA_SYNC_URL` | GHA repo secret | Low — the `github-sync` function URL |
| `AGENTJIRA_SECRET` | GHA repo secret | **Sensitive** — mirror of the project's `webhook_secret` |

### 4. Shared-secret tier

| Secret | Canonical home | Mirrored to | Sensitivity |
|---|---|---|---|
| per-project `webhook_secret` | the `projects` Postgres row (`encode(gen_random_bytes(32), 'hex')`) | GHA repo secret `AGENTJIRA_SECRET` | **Sensitive** |

One canonical home (the DB row); the GHA secret is a **mirror**, never a second
source of truth. It appears in **no** repo `.env` file.

### 5. Agent CLI tier

CLI settings are **env vars**; the only thing on disk is the cached session
token, in the user's home and never the repo tree.

| Secret | Home | Sensitivity |
|---|---|---|
| `AGENTJIRA_URL` | env var | Low |
| `AGENTJIRA_ANON_KEY` | env var | Low (public) |
| `AGENTJIRA_EMAIL` | env var | Sensitive |
| `AGENTJIRA_PASSWORD` | env var | **Sensitive** |
| session token | `~/.agentjira/session.json` (mode `0600`) | **Sensitive** |

Every CLI setting is an env var, validated in `cli/src/env.ts` at import. The CLI
reads no config file, so no setting — secret or not — is ever written to disk.
The session token is the sole exception: it is minted at sign-in rather than
supplied, so it is cached at `0600`.

**Deliberate design decision: there is no `cli/.env.example`, and the CLI loads
no `.env` file.** CLI credentials belong in the process environment, not the repo
tree. Adding a `cli/.env.example` would invite users to create a `cli/.env`
inside the repo — exactly the pattern this design forbids. The tier table above
documents CLI configuration in place of a dotenv template.

## Local-dev-only fixtures (intentionally committed)

These are committed **on purpose**, are deliberately weak, and are **never valid
anywhere hosted**:

| Fixture | Value | Boundary |
|---|---|---|
| `supabase/seed.sql` dev password | `agentjira-dev` | seed.sql **never runs against a hosted project** |
| `supabase/seed.sql` dev `webhook_secret` | `agentjira-dev-webhook-secret` | same |

Design boundary: **`seed.sql` never runs against a hosted project.** Its weak
values are acceptable precisely because they are local-only.

## Full secret matrix

| Secret | Canonical home | Who may read it | Sensitivity | Must never appear in |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `web/.env` / hosting build env | anyone (public) | Public | — |
| `VITE_SUPABASE_ANON_KEY` | `web/.env` / hosting build env | anyone (public) | Public | — (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | platform-injected into Edge Functions | `github-sync` only | High | web, CLI, repo |
| `GITHUB_APP_ID` | `github-token` Function secret | `github-token` only | Low | web, CLI |
| `GITHUB_APP_PRIVATE_KEY` | `github-token` Function secret; local source `secrets/envkey.pem` | `github-token` only | High | any committed file |
| `AGENTJIRA_SYNC_URL` | GHA repo secret | the GHA | Low | repo `.env` |
| `AGENTJIRA_SECRET` | GHA repo secret (mirror of `webhook_secret`) | the GHA, `github-sync` | Sensitive | repo `.env` |
| `webhook_secret` | `projects` Postgres row | web owner UI; `github-sync` | Sensitive | any repo `.env` |
| `AGENTJIRA_URL` | env var | the user's CLI | Low | repo tree |
| `AGENTJIRA_ANON_KEY` | env var | the user's CLI | Low (public) | repo tree |
| `AGENTJIRA_EMAIL` | env var | the user's CLI | Sensitive | repo tree |
| `AGENTJIRA_PASSWORD` | env var | the user's CLI | Sensitive | repo tree, any file on disk |
| CLI session token | `~/.agentjira/session.json` (`0600`) | the user's CLI | Sensitive | repo tree |
| seed dev password | `supabase/seed.sql` (committed) | local dev | Weak, local-only | any hosted project |
| seed dev `webhook_secret` | `supabase/seed.sql` (committed) | local dev | Weak, local-only | any hosted project |

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

## Cross-references

- `README.md` links here.
- `docs/architecture.md` §Security should link here once that document exists
  (owned by a separate node); this design is the authoritative source for the
  "secrets" non-negotiable.
