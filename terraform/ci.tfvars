# Values for `terraform plan` in CI, so the gate can run without real ones.
# Every value here is a deliberate placeholder: .invalid is reserved by RFC 2606
# and never resolves, so a plan rendered from this file can never be applied to
# anything real. Pass it explicitly (`-var-file=ci.tfvars`) - the name is not
# `.auto.tfvars` precisely so a real apply cannot pick it up by accident.
agentjira_supabase_host = "ci-placeholder.invalid"
spend_alert_email       = "ci-placeholder@example.invalid"
