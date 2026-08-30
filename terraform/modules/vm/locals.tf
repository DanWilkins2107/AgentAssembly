locals {
  # The header carries the shebang, the shell options and every terraform value, so the
  # files in user-data/ stay plain shell rather than templates escaping every ${}.
  user_data_header = [
    "#!/bin/bash",
    "set -eux",
    "export DEBIAN_FRONTEND=noninteractive",
    "agentjira_supabase_host='${var.agentjira_supabase_host}'",
  ]

  # Boot order, and it is load-bearing: squid.conf and the nftables ruleset are on disk
  # before the packages that read them, and the ruleset only loads once root is done
  # with the open egress that apt and npm need. Listed rather than globbed from
  # user-data/ so adding a file cannot silently reorder the boot.
  user_data_parts = [
    "10-loop-user.sh",
    "20-squid.sh",
    "30-nftables-ruleset.sh",
    "40-packages.sh",
    "50-egress-lockdown.sh",
    "60-loop-env.sh",
    "70-supervisor-unit.sh",
  ]
}
