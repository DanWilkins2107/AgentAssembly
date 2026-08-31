#!/bin/bash
# Boot order, and it is load-bearing: squid.conf and the nftables ruleset are on disk
# before the packages that read them, and the ruleset only loads once root is done with
# the open egress that apt and npm need.
set -eux
cd "$(dirname "$0")"

. ./loop-user.sh
. ./squid.sh
. ./nftables-ruleset.sh
. ./packages.sh
. ./egress-lockdown.sh
. ./loop-env.sh
. ./supervisor-unit.sh
