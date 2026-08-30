module "names" {
  source = "../modules/names"
}

locals {
  region      = "eu-west-2"
  name_prefix = module.names.prefix

  # Scope the OIDC trust sub. Exact case: the sub condition is case-sensitive
  # StringEquals and GitHub emits DanWilkins2107/AgentAssembly.
  repo_owner = "DanWilkins2107"
  repo_name  = "AgentAssembly"
}
