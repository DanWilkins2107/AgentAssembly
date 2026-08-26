# Placeholders for `terraform plan` in CI. Not `.auto.tfvars`: a real apply must
# never load these. Pass explicitly with `-var-file=ci.tfvars`.
agentjira_supabase_host = "ci-placeholder.invalid"
spend_alert_email       = "ci-placeholder@example.invalid"
