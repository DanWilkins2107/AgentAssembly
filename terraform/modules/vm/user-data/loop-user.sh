# shellcheck shell=bash

# Not in group proxy: that group reads the squid credential file and access log.
useradd --system --user-group --create-home --home-dir /home/loop --shell /usr/sbin/nologin loop

install -d -o loop -g loop -m 0755 /var/lib/agentassembly
