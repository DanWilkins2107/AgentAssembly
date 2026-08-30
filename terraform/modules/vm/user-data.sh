# shellcheck shell=bash
# Concatenated onto a terraform-rendered header by terraform/modules/vm/main.tf; the
# header supplies the shebang and every terraform value, so nothing here is templated.
# If this file moves, update main.tf.
set -eux

export DEBIAN_FRONTEND=noninteractive

# The loop and the bwrap'd session it runs share this account. It is deliberately
# outside group proxy: that group reads the squid credential file and access log.
useradd --system --user-group --create-home --home-dir /home/loop --shell /usr/sbin/nologin loop

cat >/etc/nftables.conf <<'NFTABLES'
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
  chain output {
    type filter hook output priority filter; policy drop;

    ct state established,related accept

    oif "lo" accept

    meta skuid 0 accept
    meta skuid "proxy" accept

    udp dport 53 accept
    tcp dport 53 accept

    udp dport 67-68 accept
    ip daddr 169.254.169.123 udp dport 123 accept
  }
}
NFTABLES
chmod 0755 /etc/nftables.conf

install -d /etc/squid
install -m 0640 -o root -g proxy /dev/null /etc/squid/proxy-users

cat >/etc/squid/squid.conf <<SQUID
http_port 127.0.0.1:3128
visible_hostname agentassembly-vm

auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/proxy-users
auth_param basic realm agentassembly
auth_param basic children 2
auth_param basic credentialsttl 5 minutes

acl session proxy_auth REQUIRED
acl allowlist dstdomain github.com api.github.com .githubusercontent.com api.anthropic.com $agentjira_supabase_host
acl ssl_ports port 443
acl connect_method method CONNECT

http_access deny !session
http_access deny connect_method !ssl_ports
http_access allow session allowlist
http_access deny all

access_log /var/log/squid/access.log squid
SQUID

cat >/usr/local/sbin/session-proxy-identity <<'IDENTITY'
#!/bin/sh
set -eu

session=$1
case "$session" in
  *[!A-Za-z0-9_-]* | "")
    echo "session id must match [A-Za-z0-9_-]+" >&2
    exit 1
    ;;
esac

users=/etc/squid/proxy-users
password=$(openssl rand -hex 16)

tmp=$(mktemp "$users.XXXXXX")
grep -v "^$session:" "$users" >"$tmp" || true
printf '%s:%s\n' "$session" "$(openssl passwd -6 "$password")" >>"$tmp"
chown root:proxy "$tmp"
chmod 0640 "$tmp"
mv "$tmp" "$users"

for name in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY; do
  printf '%s=http://%s:%s@127.0.0.1:3128\n' "$name" "$session" "$password"
done
printf 'no_proxy=localhost,127.0.0.1\n'
printf 'NO_PROXY=localhost,127.0.0.1\n'
IDENTITY
chmod 0700 /usr/local/sbin/session-proxy-identity

apt-get update
apt-get install -y git bubblewrap ca-certificates curl gnupg nftables

install -m 0755 -d /etc/apt/keyrings
# apt reads an ASCII-armored key directly when the file is named .asc, so the
# NodeSource key needs no dearmor step; GitHub already publishes binary.
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /etc/apt/keyrings/nodesource.asc
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg
chmod 0644 /etc/apt/keyrings/nodesource.asc /etc/apt/keyrings/githubcli.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.asc] https://deb.nodesource.com/node_22.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" >/etc/apt/sources.list.d/github-cli.list
apt-get update
# force-confold: squid.conf is already on disk, so dpkg must not replace it.
apt-get install -y -o Dpkg::Options::=--force-confold nodejs gh squid
systemctl enable --now squid

npm i -g @anthropic-ai/claude-code
git clone --depth 1 https://github.com/DanWilkins2107/AgentAssembly.git /opt/agentassembly
# Both clones track main, so this log line is the only record of which revision a burst ran.
git -C /opt/agentassembly rev-parse HEAD
# ci not install: the committed lockfiles decide the tree.
# Dev dependencies are runtime here — both packages start via tsx.
npm --prefix /opt/agentassembly/runner ci
npm --prefix /opt/agentassembly/supervisor ci
git clone --depth 1 https://github.com/DanWilkins2107/AgentJira.git /opt/agentjira
git -C /opt/agentjira rev-parse HEAD
# dist/ is gitignored and tsc is a devDependency, so the CLI compiles here.
npm --prefix /opt/agentjira/cli ci
npm --prefix /opt/agentjira/cli run build
npm i -g /opt/agentjira/cli

# Must stay after the apt and npm work above: that runs as root and needs open egress.
systemctl enable --now nftables

# /opt stays root-owned and read-only to loop: the session shares the account, so a
# writable clone would let it rewrite its own supervisor. This is what loop may write.
install -d -o loop -g loop -m 0755 /var/lib/agentassembly

# One boot-scoped proxy identity for the whole run; per-session identities are minted
# elsewhere. The env file carries that identity's password, so it is built under
# mktemp's 0600 and traced output is off for the whole block.
install -d -m 0755 /etc/agentassembly
set +x
boot_identity=$(/usr/local/sbin/session-proxy-identity boot)
proxy_url=$(printf '%s\n' "$boot_identity" | sed -n 's/^http_proxy=//p')
no_proxy=$(printf '%s\n' "$boot_identity" | sed -n 's/^no_proxy=//p')
env_tmp=$(mktemp /etc/agentassembly/loop.env.XXXXXX)
chown root:loop "$env_tmp"
chmod 0640 "$env_tmp"
{
  printf 'LOOP_SESSION_PROXY=%s\n' "$proxy_url"
  printf 'LOOP_SESSION_WORKDIR=%s\n' /var/lib/agentassembly
  printf 'NO_PROXY=%s\n' "$no_proxy"
} >"$env_tmp"
mv "$env_tmp" /etc/agentassembly/loop.env
set -x

install -m 0644 /opt/agentassembly/terraform/modules/vm/supervisor-loop.service /etc/systemd/system/supervisor-loop.service
systemctl daemon-reload
systemctl enable supervisor-loop.service
# This runs past multi-user.target, so WantedBy never fires this boot — start it
# explicitly. --no-block: a Type=oneshot start would hold cloud-init open for the
# loop's entire run.
systemctl start --no-block supervisor-loop.service
