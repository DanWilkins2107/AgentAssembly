# shellcheck shell=bash

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

# Fields, in order: unix timestamp, session, method, squid result/HTTP status,
# bytes to the client, destination host:port. The session is the proxy-auth
# username minted by session-proxy-identity below; the password is never a field.
# %>rd:%>rP is host:port only. The default squid format logs %ru, the whole
# request URI, so a plaintext GET to an allowlisted host writes the path (and,
# without strip_query_terms, the query) into the log - private doc ids, search
# terms, tokens. Exercised by terraform/modules/vm/tests/squid-access-log.sh.
logformat audit %ts.%03tu %ul %rm %Ss/%03>Hs %<st %>rd:%>rP
access_log /var/log/squid/access.log audit
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
