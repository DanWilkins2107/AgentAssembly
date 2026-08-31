# shellcheck shell=bash

# Must stay after the apt and npm work: that runs as root and needs open egress.
systemctl enable --now nftables
