# shellcheck shell=bash

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
