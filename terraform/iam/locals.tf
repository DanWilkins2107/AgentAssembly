locals {
  region = "eu-west-2"

  # Must match name_prefix in terraform/locals.tf and the bucket/table literals in
  # terraform/backend.tf and iam/backend.tf - state_access in main.tf builds the
  # -tfstate and -tflock ARNs from it.
  name_prefix = "agentassembly"

  # Scope the OIDC trust sub. Exact case: the sub condition is case-sensitive
  # StringEquals and GitHub emits DanWilkins2107/AgentAssembly.
  repo_owner = "DanWilkins2107"
  repo_name  = "AgentAssembly"
}
