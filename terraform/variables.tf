variable "agentjira_supabase_host" {
  type        = string
  description = "Hostname of the AgentJira Supabase project, allowlisted by the VM's egress proxy. Supplied at apply time — this repo is public and holds no endpoints."
}

variable "spend_alert_email" {
  type        = string
  description = "Address subscribed to the spend-alert SNS topic. AWS sends a confirmation email that must be accepted by hand."
}
