#!/bin/bash
# Boot order, and it is load-bearing: squid.conf and the nftables ruleset are on disk
# before the packages that read them, and the ruleset only loads once root is done with
# the open egress that apt and npm need.
set -eux
cd "$(dirname "$0")"

. ./10-loop-user.sh
. ./20-squid.sh
. ./30-nftables-ruleset.sh
. ./40-packages.sh
. ./50-egress-lockdown.sh
. ./60-loop-env.sh
. ./70-supervisor-unit.sh
