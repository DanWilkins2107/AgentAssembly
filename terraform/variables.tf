# ci.tfvars holds placeholder values for both of these, so `terraform plan` can run
# in CI. Add any new required variable there too or the plan gate starts prompting.
variable "agentjira_supabase_host" {
  type        = string
  description = "Hostname of the AgentJira Supabase project, allowlisted by the VM's egress proxy. Supplied at apply time — this repo is public and holds no endpoints."
}

variable "spend_alert_email" {
  type        = string
  description = "Address subscribed to the spend-alert SNS topic. AWS sends a confirmation email that must be accepted by hand."
}
