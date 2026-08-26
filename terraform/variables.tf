variable "spend_alert_email" {
  type        = string
  description = "Address subscribed to the spend-alert SNS topic. AWS sends a confirmation email that must be accepted by hand."
}

variable "harness_ref" {
  type        = string
  description = "Git ref (branch, tag or SHA) of AgentAssembly each VM boots. Roll forward or back by changing this and applying."
  default     = "main"
}

variable "agentjira_cli_ref" {
  type        = string
  description = "Git ref (branch, tag or SHA) of AgentJira the VM builds the aj CLI from."
  default     = "main"
}
