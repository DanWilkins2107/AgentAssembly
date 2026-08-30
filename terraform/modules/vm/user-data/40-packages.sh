# shellcheck shell=bash

apt-get update
apt-get install -y git bubblewrap ca-certificates curl gnupg nftables

install -m 0755 -d /etc/apt/keyrings
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
git clone --depth 1 https://github.com/DanWilkins2107/AgentJira.git /opt/agentjira
# Both clones track main, so these lines are the only record of which revision a burst ran.
git -C /opt/agentassembly rev-parse HEAD
git -C /opt/agentjira rev-parse HEAD

# ci not install, and dev dependencies stay: runner and supervisor both start via tsx.
npm --prefix /opt/agentassembly/runner ci
npm --prefix /opt/agentassembly/supervisor ci
npm --prefix /opt/agentjira/cli ci
npm --prefix /opt/agentjira/cli run build
npm i -g /opt/agentjira/cli
