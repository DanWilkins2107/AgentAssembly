# AgentAssembly

## PR evidence

Applies only to PRs that touch `web/`. Skip it for CLI, CI, DB and docs PRs.

Before requesting review:

- Capture every changed view at desktop 1280px and mobile 375px, plus a screen
  recording for any multi-step flow.
- Capture ad-hoc with `npx playwright`. Commit nothing.
- Run the `pr-evidence` skill to upload the captures and comment on the PR.

Per-machine prerequisites, none of them automatable:

- The `pr-evidence` CLI on PATH (`npm link` from
  [pr-evidence-gallery](https://github.com/DanWilkins2107/pr-evidence-gallery)).
- That CLI's `.env` filled in.
- `gh` authenticated.

If a prerequisite is missing, say so on the PR. Never drop the evidence silently.
