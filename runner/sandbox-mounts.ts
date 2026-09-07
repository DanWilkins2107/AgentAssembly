import { existsSync } from "node:fs";

// Everything the session is allowed to read, named one path at a time. Never a
// blanket /etc: the whole directory would hand the session
// /etc/agentassembly/loop.env (root:loop 0640) — its own proxy password — and
// /etc/squid/proxy-users alongside it.
//
// The sandbox root is an otherwise empty tmpfs, so every entry below has to earn
// its place by being something the session cannot run without. Target image is
// terraform/modules/vm: Ubuntu noble 24.04 amd64.
const RO_PATHS = [
  // Every binary and shared library the session executes: node, git, gh, claude.
  "/usr",
  // Noble is usr-merged, so these three are symlinks into /usr — but the sandbox
  // root is a fresh tmpfs, so the paths only exist if they are bound. /bin is
  // named by every "#!/bin/sh" shebang, /lib by DT_NEEDED library lookups, and
  // /lib64 holds ld-linux-x86-64.so.2, the PT_INTERP of every dynamically linked
  // binary on this image. Nothing starts at all without that last one.
  "/bin",
  "/lib",
  "/lib64",
  // terraform/modules/vm/user-data/packages.sh clones the harness to
  // /opt/agentassembly and the aj CLI to /opt/agentjira; the globally installed
  // `aj` the session calls resolves back into that tree.
  "/opt",
  // The CA bundle. Without it every TLS handshake through the proxy fails.
  "/etc/ssl/certs",
  // Resolves "localhost", which is the whole of the session's no_proxy list and
  // the only host it ever connects to without going through the proxy.
  "/etc/hosts",
  // glibc reads this before any passwd/group/hosts lookup. Absent, the lookup
  // order falls back to glibc's compiled-in default rather than the image's.
  "/etc/nsswitch.conf",
  // getpwuid/getgrgid for SANDBOX_UID below. With no entry for it, node's
  // os.userInfo() throws and git refuses to auto-detect a committer identity.
  // Both files are world-readable and hold no secret — /etc/shadow is not bound.
  "/etc/passwd",
  "/etc/group",
];

// Deliberately absent, and worth saying why rather than leaving it to a diff:
//
// /sbin and /lib32 — nothing the session runs lives in either on a noble amd64
// image (/lib32 is multiarch i386, which is not installed at all).
//
// /etc/resolv.conf — the real reduction of the three. The nftables output chain
// in terraform/modules/vm/user-data/nftables-ruleset.sh accepts port 53 from any
// uid, so DNS is the one egress path the host firewall leaves open to the
// session. It does not need it: every destination is reached by name *through*
// the proxy, and squid does the resolving. With no resolver configured glibc
// falls back to 127.0.0.1, finds nothing listening, and that channel is shut.

// These are ids *inside* the user namespace, not host ids. Under --unshare-user
// bwrap maps the single caller uid — the `loop` system account from
// terraform/modules/vm/user-data/loop-user.sh — onto the id named here, so this
// only decides what the session sees from getuid() and in `ls -n`. It is set at
// all because the default is uid 0 inside the namespace, and namespace-root
// holds every capability within it: enough to mount, and to chown anything in
// the workdir bind. Whatever the session writes still lands on the host owned by
// the real `loop` uid either way.
export const SANDBOX_UID = "1000";
export const SANDBOX_GID = "1000";

// A tmpfs rather than a bind, so the config, caches and credentials a tool drops
// in $HOME die with the sandbox instead of leaking into the next session.
export const SANDBOX_HOME = "/home/agent";

/**
 * bwrap aborts the entire spawn if a --ro-bind source does not exist, so the
 * list is filtered against the image it is actually running on rather than
 * assumed. That is what `exists` is for.
 *
 * It is a parameter and not a direct existsSync call so the tests can assert the
 * exact bind vector for a known filesystem, instead of depending on whatever the
 * machine running them happens to have in /. It never widens what can be bound —
 * RO_PATHS is the only source of paths, and the seam can only remove from it.
 */
export function roBindArgs(
  exists: (p: string) => boolean = existsSync,
): string[] {
  const args: string[] = [];
  for (const p of RO_PATHS) {
    if (exists(p)) args.push("--ro-bind", p, p);
  }
  return args;
}
