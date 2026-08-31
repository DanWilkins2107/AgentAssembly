# shellcheck shell=bash

install -m 0644 /opt/agentassembly/terraform/modules/vm/supervisor-loop.service /etc/systemd/system/supervisor-loop.service
systemctl daemon-reload
systemctl enable supervisor-loop.service
# This runs past multi-user.target, so WantedBy never fires this boot. --no-block: a
# Type=oneshot start would hold cloud-init open for the loop's entire run.
systemctl start --no-block supervisor-loop.service
