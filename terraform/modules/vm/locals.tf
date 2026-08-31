locals {
  boot_dir = "/opt/agentassembly-boot"

  # user-data writes every user-data/ file to disk verbatim and hands over to entry.sh,
  # which owns the boot order. Terraform values are exported here and nowhere else, so
  # the phase files stay plain, shellcheck-able shell rather than templates escaping
  # every ${}.
  user_data = join("\n", concat(
    [
      "#!/bin/bash",
      "set -eu",
      "export DEBIAN_FRONTEND=noninteractive",
      "export agentjira_supabase_host='${var.agentjira_supabase_host}'",
      "install -d -m 0700 ${local.boot_dir}",
    ],
    [
      for part in fileset("${path.module}/user-data", "*.sh") :
      "cat >${local.boot_dir}/${part} <<'AGENTASSEMBLY_BOOT_EOF'\n${trimspace(file("${path.module}/user-data/${part}"))}\nAGENTASSEMBLY_BOOT_EOF"
    ],
    ["exec bash ${local.boot_dir}/entry.sh"],
  ))
}
