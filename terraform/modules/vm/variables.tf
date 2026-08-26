variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "dns_resolver_cidr" {
  type = string
}

# Not committed: supplied at apply time so this public repo carries no endpoint.
variable "agentjira_supabase_host" {
  type        = string
  description = "Hostname of the AgentJira Supabase project. The egress proxy allowlists it alongside GitHub and the Anthropic API."

  validation {
    condition     = can(regex("^[a-z0-9.-]+$", var.agentjira_supabase_host))
    error_message = "Must be a bare hostname — no scheme, port or path, or the squid allowlist silently stops matching."
  }
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "root_volume_size" {
  type    = number
  default = 30
}
