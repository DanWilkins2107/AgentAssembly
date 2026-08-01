# AgentAssembly

## PR evidence

Applies only to PRs that touch `web/`. Skip it for CLI, CI, DB and docs PRs.

Capture every changed view at desktop 1280px and mobile 375px, plus a screen
recording for any multi-step flow. Capture ad-hoc with `npx playwright`; commit
nothing.

If the `pr-evidence` tooling is missing, say so on the PR rather than dropping
the evidence.
