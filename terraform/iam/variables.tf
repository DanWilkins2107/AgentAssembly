variable "region" {
  type    = string
  default = "eu-west-2"
}

variable "account_id" {
  type        = string
  description = "AWS account the CI roles live in. Builds the exact state-lock ARN for least-priv. No default: nothing account-identifying is committed."
}

variable "repo_owner" {
  type        = string
  default     = "DanWilkins2107"
  description = "GitHub org/user that owns the repo. Scopes the OIDC trust sub. Change only when the repo moves owners."
}

variable "repo_name" {
  type        = string
  default     = "AgentAssembly"
  description = "GitHub repo name, exact case - the OIDC sub condition is case-sensitive StringEquals and GitHub emits AgentAssembly. Change only when the repo is renamed/moved."
}
