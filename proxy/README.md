# AgentAssembly proxy

The sandbox's egress boundary: a CONNECT-only proxy on `127.0.0.1:3128`, replacing
squid. Node builtins only, no runtime dependencies.

One request head is parsed and then never parsed again — from the `200` onward the
connection is a raw two-way byte copy. There is no plaintext forwarding code path
at all, so a non-CONNECT request can only be refused, never proxied.

`createProxy({ policy, log })` consults `policy(host, port, proxyAuthorization)`
before any outbound socket exists, and is handed a lowercased, LDH-validated
hostname — no port, userinfo, IP literal, trailing dot or uppercase left in it, so
an entry compared with `===` or a `.suffix` boundary check cannot be smuggled past.
`denyAll` is the default, so the core on its own tunnels nothing.

The access log is six space-separated fields: unix ts, session id, method,
result/status, bytes to client, host. Refusals log too, with `-` for anything
unknown. Appends to `PROXY_ACCESS_LOG`; `SIGHUP` reopens it for rotation.
