# `secrets/` — local private-key material

This directory is the **canonical local home** for private-key material and any
other real secret files on a developer's machine. See [`docs/secrets.md`](../docs/secrets.md)
for the full secrets design.

## What lives here

- **`secrets/envkey.pem`** — the GitHub App private key in PKCS#8 PEM, used as the
  local source for the `github-token` Edge Function's `GITHUB_APP_PRIVATE_KEY`
  (server-secret tier). Produce it with the `openssl` command documented in
  [`supabase/functions/.env.example`](../supabase/functions/.env.example).

## Why this directory is (almost) empty in git

Everything under `secrets/` is **gitignored** except this README:

```
secrets/*
!secrets/README.md
```

So the location exists and self-documents in a fresh clone, while **no real
secret is ever committed**. Never remove the ignore rule, and never commit a real
key here. If a real secret ends up tracked, the CI secret-scan gate is designed to
fail the build.
