# shellcheck shell=bash

install -d -m 0755 /etc/agentassembly

# One boot-scoped identity for the whole run. The env file carries its password, so it
# is built under mktemp's 0600 and tracing is off for the block.
set +x
boot_identity=$(/usr/local/sbin/session-proxy-identity boot)
proxy_url=$(printf '%s\n' "$boot_identity" | sed -n 's/^http_proxy=//p')
no_proxy=$(printf '%s\n' "$boot_identity" | sed -n 's/^no_proxy=//p')
env_tmp=$(mktemp /etc/agentassembly/loop.env.XXXXXX)
chown root:loop "$env_tmp"
chmod 0640 "$env_tmp"
# runner/sandbox.ts parses these names — rename in both places or the session
# boots with no proxy.
{
  printf 'LOOP_SESSION_PROXY=%s\n' "$proxy_url"
  printf 'LOOP_SESSION_WORKDIR=%s\n' /var/lib/agentassembly
  printf 'NO_PROXY=%s\n' "$no_proxy"
} >"$env_tmp"
mv "$env_tmp" /etc/agentassembly/loop.env
set -x
