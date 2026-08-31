# AgentAssembly proxy

The sandbox's egress boundary: a CONNECT-only proxy on `127.0.0.1:3128`, replacing
squid. Node builtins only, no runtime dependencies.

One request head is parsed and then never parsed again — from the `200` onward the
connection is a raw two-way byte copy. There is no plaintext forwarding code path
at all, so a non-CONNECT request can only be refused, never proxied.

## Refusals

| Case                                                       | Status                      |
| ---------------------------------------------------------- | --------------------------- |
| Any method but `CONNECT`                                   | 405                         |
| Unparseable request line, bad host, oversized or slow head | 400                         |
| Port other than 443                                        | 403                         |
| Policy said no                                             | policy's choice (403 / 407) |
| Upstream would not accept                                  | 502                         |

## Policy hook

`createProxy({ policy, log })` consults `policy(host, port, proxyAuthorization)`
before any outbound socket exists. `denyAll` is the default, so the core on its own
tunnels nothing — the allowlist and per-session credentials land separately.

The host it is handed is a lowercased, LDH-validated hostname; there is no port,
userinfo, IP literal, trailing dot or uppercase left in it, so an entry compared
with `===` or a `.suffix` boundary check cannot be smuggled past.

## Access log

Six space-separated fields, unchanged from the squid `audit` logformat:
unix ts, session id, method, result/status, bytes to client, `host:port`. Refusals
log too, with `-` where the session or destination is unknown. Nothing a client
sends is interpolated: the method comes from a fixed token set, the destination is
rebuilt from validated parts, and a session id outside `[A-Za-z0-9_-]+` is dropped.

Appends to `PROXY_ACCESS_LOG`; `SIGHUP` reopens it for rotation.

## Scripts

```
npm run typecheck   # tsc --noEmit, includes tests
npm run build       # tsc -> dist/
npm test            # vitest with coverage at 100%
npm run lint        # eslint
npm run format:check # prettier --check
```
