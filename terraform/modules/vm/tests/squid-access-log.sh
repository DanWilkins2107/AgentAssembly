#!/bin/bash
# Runs the real boot phase terraform/modules/vm/user-data/squid.sh and proves the
# access log it configures records host:port and never path, query or credentials.
# Destructive (installs packages, edits /etc/hosts) - run it in a throwaway container:
#   docker run --rm -v "$PWD:/repo" -w /repo ubuntu:24.04 \
#     terraform/modules/vm/tests/squid-access-log.sh
set -euo pipefail

squid_phase=terraform/modules/vm/user-data/squid.sh
secret=SUPERSECRETTOKEN
session=sess-test_1
log=/var/log/squid/access.log
work=$(mktemp -d)

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq squid python3 curl openssl >/dev/null

# The phase writes /etc/squid/squid.conf, /etc/squid/proxy-users and
# session-proxy-identity exactly as the boot does; only the terraform-supplied
# allowlist host is stubbed, which locals.tf exports before entry.sh runs the phases.
agentjira_supabase_host=supabase.test
# shellcheck source=terraform/modules/vm/user-data/squid.sh
. "$squid_phase"

# The same line packages.sh runs; the read/truncate assertions below depend on it.
install -d -o proxy -g proxy -m 0750 /var/log/squid

eval "$(session-proxy-identity "$session" | sed 's/^/export /')"

# github.com is on the squid allowlist, so pointing it at a local origin exercises
# the allowed plaintext path without leaving the container.
echo '127.0.0.1 github.com' >>/etc/hosts
echo 'origin' >"$work/index.html"
python3 -m http.server 80 --bind 127.0.0.1 --directory "$work" &>/dev/null &
origin_pid=$!
trap 'kill "$origin_pid" 2>/dev/null || true' EXIT

squid
for _ in $(seq 30); do
  if (exec 3<>/dev/tcp/127.0.0.1/3128) 2>/dev/null; then break; fi
  sleep 1
done

curl -sS -o /dev/null -x "$http_proxy" "http://github.com/index.html?token=$secret&doc=private-doc-id"
curl -sS -o /dev/null -x "$http_proxy" "http://blocked.example/secret?token=$secret" || true
curl -sS -o /dev/null -x http://127.0.0.1:3128 "http://github.com/index.html?token=$secret" || true

# SIGINT is squid's immediate shutdown; it flushes the log daemon on the way out.
squid -k interrupt
for _ in $(seq 30); do
  if [ ! -e /run/squid.pid ]; then break; fi
  sleep 1
done

cat "$log"

grep -q . "$log" || fail 'access log is empty'
grep -qE "^[0-9]+\.[0-9]{3} $session GET TCP_[A-Z_]+/200 [0-9]+ github\.com:80$" "$log" ||
  fail 'allowed request did not log the six redacted fields'
grep -qE "^[0-9]+\.[0-9]{3} $session GET TCP_DENIED/403 [0-9]+ blocked\.example:80$" "$log" ||
  fail 'denied request did not log host:port'
grep -qE "^[0-9]+\.[0-9]{3} - GET TCP_DENIED/407 [0-9]+ github\.com:80$" "$log" ||
  fail 'unauthenticated request did not log with an empty session'
for leak in "$secret" 'private-doc-id' 'index.html' '?'; do
  if grep -qF -- "$leak" "$log"; then fail "access log leaked '$leak'"; fi
done

if su -s /bin/sh nobody -c "cat $log" >/dev/null 2>&1; then
  fail 'a uid outside group proxy could read the log'
fi
if su -s /bin/sh nobody -c ": >$log" 2>/dev/null; then
  fail 'a uid outside group proxy could truncate the log'
fi
cat "$log" >/dev/null || fail 'root could not read the log'

echo 'PASS: access log is redacted to host:port and unreadable outside group proxy'
