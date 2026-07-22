# `secrets/` — local private-key material

Canonical local home for private-key material. Everything here is gitignored
except this README. See [`docs/secrets.md`](../docs/secrets.md).

- `secrets/envkey.pem` — GitHub App private key (PKCS#8 PEM), local source for the
  `github-token` Edge Function's `GITHUB_APP_PRIVATE_KEY`. Generate it with the
  `openssl` command in [`supabase/functions/.env.example`](../supabase/functions/.env.example).
