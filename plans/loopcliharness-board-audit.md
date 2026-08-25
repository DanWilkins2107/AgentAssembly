# LoopCliHarness board audit

Keep / fold / drop call for every live node on the **LoopCliHarness** AgentJira project
(`13a42f3e`, repo `DanWilkins2107/LoopCLIHarness`), ahead of retiring that board in favour of
**AgentAssembly** (`9d8cef1a`).

Input to the post-merge breakdown of node `c139a638` ("Audit the LoopCliHarness board"), which is
flagged `breakdown_on_merge`. **This document decides nothing on the board.** No node was created,
edited, invalidated or moved while writing it, and no LoopCLIHarness PR was touched.

Board state as read on **2026-08-25**.

---

## How to read this

| Verdict | Means |
|---|---|
| **recreate** | Real remaining work. Make a new node on AgentAssembly under the named parent, then `aj invalidate <original> --reason "recreated on AgentAssembly as <new id>"`. |
| **fold** | Already covered by a named AgentAssembly node. No new node. `aj invalidate <original> --reason "folded into AgentAssembly <id>"`. |
| **drop** | Obsolete after the move. `aj invalidate <original> --reason "<why>"`. |

Nothing is ever deleted. Every retirement below is an `aj invalidate --reason`, never a delete.

---

## Scope check — the survey was one root short

The `c139a638` spec named three roots. The live board actually has **four**:

| Root | Live descendants |
|---|---|
| `6539b7f7` LoopCliHarness (vision) | 12 |
| `8f7471f2` CI testing | 5 |
| `c2ed6ace` **Terraform plan + CD** — rootless, no ancestors | 3 |
| `eb6326d9` Project-prefix all plugin marketplace names — rootless leaf | 1 (itself) |

`c2ed6ace` is not reachable from either named root and was missed by the survey. It holds
`a92a4eed`, `ffb2691d` and `a2d624bd` — three of the items below.

Live leaf count is **24**: 18 agent-turn, 3 `pr_raised`, 3 `human_only_action` (the spec said 2;
`a2d624bd` sits under the missed root). Two nodes are already `invalidated` (`ebcb50be` branch
protection, `07eccf9e` shared tooling config) and are out of scope.

---

## Blockers found while verifying (read these before acting on the table)

### 1. The GitHub Environment is called `deploy`, not `prod`

AgentAssembly `072af3ba` says "Create an Environment named `prod`". LoopCLIHarness main disagrees:
node `a0e2cedd` (PR #23, merged) renamed the OIDC trust subject, and
`terraform/iam/main.tf:57` on `origin/main` now reads

```
values = ["repo:${var.repo_owner}/${var.repo_name}:environment:deploy"]
```

The trust condition is an exact-match `StringEquals`, so a `prod` Environment on AgentAssembly will
never satisfy it. Either `072af3ba` becomes "Environment named `deploy`", or `d3c414b0` changes the
string back as part of the re-scope. Pick one deliberately — this is the failure mode that only
shows up on the first apply.

### 2. `072af3ba` asks for six role ARNs; there are two, plus a region

`terraform/iam/outputs.tf` exposes `oidc_provider_arn`, `ci_plan_role_arn`, `ci_apply_role_arn`. The
original human ticket (`a48b75bd`) asked for `ci_plan_role_arn`, `ci_apply_role_arn` and the region
(`eu-west-2`). "6 role ARNs" in `072af3ba` has no basis in the source repo.

### 3. The local source clone the copy nodes point at is badly stale

Six AgentAssembly copy nodes (`c05276d6`, `4225603c`, `5f3f5466`, `54365fcd`, `f022f5f4`,
`d3c414b0`) name `C:\Users\danwi\LoopCliHarness` as the source. That working tree is parked at
`0b7722c` (the PR #17 merge); `origin/main` is 100+ commits ahead. Copying from the clone as it
stands would import pre-PR-#23 IAM, pre-workspace package layout, and none of the mutation-testing
work. **Copy from `origin/main`, not from the local checkout.**

### 4. The spawn Lambda is pinned to the LoopCliHarness *board*, not the repo

`d9798b52`'s spec hardcodes `AGENTJIRA_PROJECT_ID = 13a42f3e-…` — the LoopCliHarness project uuid.
Archiving the repo does not retire the project id, so the Lambda keeps polling the dead board unless
it is repointed at `9d8cef1a`. That decision also changes `a0c08e77` (which board the Lambda's
service account needs a role on). Neither AgentAssembly node covers it today.

### 5. AWS state and resource names stay `loopcliharness-*`

`f022f5f4` already flags that the S3 state bucket and DynamoDB lock table keep the
`name_prefix = "loopcliharness"`. Every recreated Terraform node below inherits that: resources are
named `loopcliharness-spawn` etc., and `ci_apply`'s ARN scoping matches on that prefix. Renaming is
a separate destructive job nobody has a node for.

---

## Verdict table

### Root `6539b7f7` — LoopCliHarness (the harness roadmap)

| Node | Title | Status | Verdict | Reason |
|---|---|---|---|---|
| `6539b7f7` | LoopCliHarness | broken_down | **recreate** (root) | The vision still stands; only the repo moved. Recreate as a new AgentAssembly vision node — it is the parent everything else in this section needs. `46585383` is the *migration*, and closes. |
| `e26e6a4b` | Loop core harness | broken_down | **drop** | Whole subtree merged (PRs #4, #6, #9, #10, #13). Nothing live. Code arrives via `5f3f5466` / `54365fcd`. |
| `8276b707` | VM bootstrap & deployment | broken_down | **recreate** (container) | Subtree is mixed — `4dfe0487` and `d6972b4b` are fully merged, but `2f94026e` and `600ec9e2` still hold 6 live leaves. Recreate as container only. |
| `2f94026e` | Lambda trigger + guarded ephemeral-VM spawn | broken_down | **recreate** (container) | Holds 5 live leaves below. |
| `7b694e33` | Terraform: Lambda + EventBridge + scoped role + secret | broken_down | **recreate** (container) | 3 spec'd children unbuilt, 1 in an open PR. |
| `d9798b52` | Terraform: spawn Lambda function + exec role | pr_raised (#50) | **fold** → `ff25ca41` | Confirmed. `ff25ca41`'s approved spec merges #50 as-is; the code then arrives free via `f022f5f4`. |
| `bf87dc40` | Terraform: EC2 inline policy on the spawn exec role | awaiting_agent_spec | **recreate** → new `7b694e33` | Unbuilt, and the body calls it "the entire security surface". Body carries the full statement design — carry it verbatim. |
| `9d28c95d` | Terraform: EventBridge schedule arming the spawn Lambda | awaiting_agent_spec | **recreate** → new `7b694e33` | Unbuilt. Firm-block from the recreated `bf87dc40` must be recreated too — arming the cron before the fn has EC2 rights just errors every 5 minutes. |
| `0663d595` | Terraform: spawn Lambda log group with retention limit | awaiting_agent_spec | **recreate** → new `7b694e33` | Unbuilt. Note it also needs a `terraform/iam` change (`logs:` actions on that one log-group ARN) — coordinate with `d3c414b0`, which owns `iam/` here. |
| `a0c08e77` | HUMAN-ONLY: create Lambda board account + store credentials | human_only_action | **recreate** → new `2f94026e` | Not done, still human-only. **Changes on carry-over:** the account needs the lowest role on the *AgentAssembly* project, not LoopCliHarness — see blocker 4. |
| `8a076125` | HUMAN-ONLY: apply spend-guard terraform, subscribe SNS | human_only_action | **recreate** → new `2f94026e` | Not done. The AWS budget/SNS topic still do not exist; the state does not move, so the work is unchanged apart from where the node lives. |
| `600ec9e2` | VM boot integration & self-stop | broken_down | **recreate** (container) | One live child. |
| `9ef30a97` | Give the boot run its bwrap sandbox env | awaiting_agent_spec | **recreate** → new `600ec9e2` | Unbuilt and load-bearing: without it the boot unit errors every task and powers off. Depends on `c9315e26`'s proxy URL — recreate that firm block. |
| `6d9fae93` | Sandboxing, hosting & credentials exploration | broken_down | **recreate** (container) | Decisions (`c1b0780b`, `9e56122f`) are merged docs; the two live sub-containers below are not. |
| `e126cb28` | Network isolation posture | broken_down | **recreate** (container) | Posture doc merged (PR #2); 2 live children. |
| `c9315e26` | Egress lockdown baked into the VM image | ready_for_pickup | **recreate** → new `e126cb28` | Has a full approved spec and zero code. Highest-value single carry-over on the board. Copy the spec verbatim. |
| `29ae58fa` | Proxy audit log — cheap & short-retention | awaiting_agent_breakdown | **recreate** → new `e126cb28` | Unbuilt. Carries a `split_decision` (short retention, not durable archival) that would be lost. |
| `9e800d99` | Credential flow | broken_down | **recreate** (container) | Flow doc merged (PR #3); all 3 children unbuilt. |
| `02ee3d7b` | Credential infrastructure (secrets manager + KMS + scoping) | awaiting_agent_breakdown | **recreate** → new `9e800d99` | Unbuilt. Security-shaped — keep it spec'd, not spec-less. |
| `71dc00bb` | Host-root credential broker service | awaiting_agent_breakdown | **recreate** → new `9e800d99` | Unbuilt. |
| `95041f51` | Session-side credential-helper wiring | awaiting_agent_breakdown | **recreate** → new `9e800d99` | Unbuilt. |
| `5039267c` | Sandbox lifecycle & rolling updates | awaiting_agent_breakdown | **recreate** → new root | Unbuilt, explicitly "comes after v1 is running". Still wanted. |
| `d5a61a60` | Admin audit site | broken_down | **recreate** (container) | Both children unbuilt. |
| `c10f1c4c` | Audit data API | awaiting_agent_breakdown | **recreate** → new `d5a61a60` | Unbuilt. Security-sensitive (egress + credential-access records, single-operator auth). |
| `ffc2694e` | Audit dashboard UI | awaiting_agent_breakdown | **recreate** → new `d5a61a60` | Unbuilt. **Changes on carry-over:** AgentAssembly's `CLAUDE.md` requires PR evidence (desktop 1280 + mobile 375, recording for multi-step flows) for anything touching `web/`. LoopCLIHarness had no such rule. |

Merged containers with nothing live — `4dfe0487`, `d6972b4b`, `4f2e8f58`, `c312861e`, `38a4fa30`,
`4f1d9719`, `86295af4`, `c1b0780b`, `9e56122f` — are **drop**: subtree complete, code carried by the
copy nodes.

### Root `8f7471f2` — CI testing

| Node | Title | Status | Verdict | Reason |
|---|---|---|---|---|
| `8f7471f2` | CI testing | broken_down | **drop** (as a container) | AgentAssembly already has its own lint / coverage / complexity / Fallow gates on `cli/`. Don't import a second CI root; the live leaves below hang off the copy nodes instead. |
| `7522d734` | Runner run-task mutants | pr_raised (#49) | **fold** → `ff25ca41` | Confirmed. #49 is open and green; `ff25ca41` merges it, and the mutants land free in the `runner/` copy. |
| `ff0c9fe9` | Loop control-flow survivors and drop the mutate exclusion | pr_raised (#51) | **fold** → `ff25ca41` | Confirmed. #51 is open; `ff25ca41` re-expresses the `!loop.ts` exclusion drop against the renamed `.mjs` config, then merges. |
| `6277838d` | Runner run-judge mutants | ready_for_pickup | **recreate** → under `5f3f5466` | **Correction to the assumed fold.** `5f3f5466` only *decides* the runner CI bar; it does not contain 56 named survivors. Fold the decision, recreate the work as a child once `runner/` has landed and the bar says "mutation testing". Firm-blocked on #49 landing. |
| `e66775f8` | Turn onto 100 | awaiting_agent_spec | **recreate** → under new root, blocked by `5f3f5466` + `54365fcd` | **Correction to the assumed fold.** It sets `break: 100` and empties the mutate exclusions in *both* stryker configs — it spans runner and supervisor, so it cannot fold into `5f3f5466` alone. One node, two firm blocks. |
| `f3cb8b21` | Terraform static analysis | ready_for_pickup | **recreate** → new `c2ed6ace` | **Correction to the assumed fold.** `081b989a` ports the existing `terraform.yml` (fmt + validate only — verified against the source). `f3cb8b21` has its own approved spec adding a *new* `static-analysis` job (tflint + checkov, baseline-phased) and explicitly says not to touch the existing jobs. Folding it into the port silently drops a spec'd PR. |
| `ec1124b9`, `b2e5a83e`, `767fc58d`, `0e8ebece`, `39aef759`, `d05103a1`, `514cb8ba`, and the merged leaves | mutation-gate subtree | mixed | **drop** (containers) | Everything except `6277838d`/`e66775f8`/the two open PRs is merged. The tests and configs come across with `runner/` and `supervisor/`. |
| `ebcb50be`, `07eccf9e` | — | invalidated | **n/a** | Already invalidated; out of scope. Note `ebcb50be` (branch protection) was invalidated on its own merits, not by the move — re-open it here only if you want it, do not carry it. |

### Root `c2ed6ace` — Terraform plan + CD (the root the survey missed)

| Node | Title | Status | Verdict | Reason |
|---|---|---|---|---|
| `c2ed6ace` | Terraform plan + CD | broken_down | **recreate** (container) → under `46585383` or the new root | Holds two spec'd-but-unbuilt CI jobs plus `f3cb8b21`. Needs a firm block from `081b989a` (the workflow file must exist first) and from `072af3ba` (no role to assume without the repo vars). |
| `a48b75bd` | GitHub Environment 'prod' + CI role repo vars | broken_down | **fold** → `072af3ba` | Confirmed — but see blockers 1 and 2. The child that actually matters is `a2d624bd`, below. |
| `a0e2cedd` | Rename CI apply environment from prod to deploy | done (#23) | **drop** | Merged. Its outcome is the `deploy` string in blocker 1 — carry the *fact*, not the node. |
| `a2d624bd` | HUMAN-ONLY: apply terraform/iam, create environment, set repo vars | human_only_action | **fold** → `d3c414b0` (the apply) + `072af3ba` (Environment + vars) | Confirmed, and it splits across two existing nodes. Its body has the exact `terraform apply` invocation and the case-sensitivity warning — worth copying into `d3c414b0` before invalidating. |
| `a92a4eed` | Terraform plan-on-PR with sticky comment | awaiting_agent_spec | **recreate** → new `c2ed6ace` | **Correction to the assumed fold.** Unbuilt; a distinct job (OIDC assume `ci_plan`, plan on root `terraform/` only, sticky PR comment). `081b989a` is a verbatim port and does not contain it. |
| `ffb2691d` | Terraform apply-on-merge behind prod environment gate | awaiting_agent_spec | **recreate** → new `c2ed6ace` | **Correction to the assumed fold.** Unbuilt. Carries the live caveat that `ci_apply` is scoped to state + EC2 only and will fail once VPC/SG/launch-template/IAM resources land — still true after the move. Rename to "…behind the `deploy` environment gate" per blocker 1. |

### Rootless

| Node | Title | Status | Verdict | Reason |
|---|---|---|---|---|
| `eb6326d9` | Project-prefix all plugin marketplace names | awaiting_agent_breakdown | **fold** → `f37e3eb7` | AgentAssembly already carries the identical node (`f37e3eb7`, `ready_for_pickup`, with an approved spec), and `eb6326d9`'s own body names it as the sibling to coordinate with. The LoopCLIHarness-side rename (`loop-cli-harness-*`) dies with the archived repo; the machine-local `~/.claude` cleanup is already described in `f37e3eb7`'s body. |

---

## What "recreate" concretely means

Nothing on the board can be moved — `aj` has no move-node. Each recreate is:

1. `aj create-node -p AgentAssembly --title <same title> --body <original body, verbatim> --parent <new parent> --status <original status>` — keep the original status so the node re-enters at the same stage.
2. Where the original had an **approved spec** (`c9315e26`, `f3cb8b21`), carry the spec text over too and set the node straight to `ready_for_pickup`. Re-specing them from scratch throws away human review.
3. Recreate the **block edges between recreated nodes** — most of the ordering value on this board is in the firm blocks, and they do not come across for free. Blocks pointing at nodes that stayed behind become blocks on the AgentAssembly equivalent (e.g. `d6972b4b` → `f022f5f4`).
4. `aj invalidate <original> --reason "recreated on AgentAssembly as <new id>"`.

Recreate the containers **before** their children, so `--parent` resolves.

## Suggested ordering for the post-merge breakdown

1. New AgentAssembly vision node from `6539b7f7`, plus the container skeleton
   (`8276b707` → `2f94026e` → `7b694e33`, `600ec9e2`, `6d9fae93` → `e126cb28` / `9e800d99`,
   `d5a61a60`, `c2ed6ace`).
2. Spec-carrying leaves first — `c9315e26`, `f3cb8b21` — they arrive `ready_for_pickup`.
3. The rest of the leaves, with their block edges.
4. The two human-only nodes (`a0c08e77`, `8a076125`), after resolving blocker 4.
5. Only then invalidate the originals, in leaf-to-root order, each with a reason naming the
   AgentAssembly node that replaced it.

## Known gap this audit does not close

`ff25ca41`'s spec already notes it: `lambda/spawn/`, `deploy/`, `.fallowrc.json` and the shared
eslint/stryker base configs have **no copy node** under `46585383`. `d9798b52`'s Terraform points
`archive_file` at `lambda/spawn/dist`, so the spawn Lambda cannot be applied from AgentAssembly
until `lambda/spawn/` is copied. That is a gap in the *code* split, not in this board audit, but the
recreated `7b694e33` subtree is unbuildable without it.
