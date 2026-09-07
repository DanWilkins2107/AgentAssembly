import { z } from "zod";
import {
  roBindArgs,
  SANDBOX_GID,
  SANDBOX_HOME,
  SANDBOX_UID,
} from "./sandbox-mounts";
import { proxyArgs } from "./sandbox-proxy";

// These names are written by terraform/modules/vm/user-data/loop-env.sh —
// rename in both places or the session boots with no proxy.
const SandboxEnvSchema = z.object({
  LOOP_SESSION_PROXY: z.url("must be a proxy URL, e.g. http://127.0.0.1:3128"),
  LOOP_SESSION_WORKDIR: z
    .string({ error: "must be a path" })
    .trim()
    .min(1, "must be a non-empty path"),
  NO_PROXY: z.string().trim().min(1).optional(),
});

export type SandboxEnv = z.infer<typeof SandboxEnvSchema>;

export type EnvResult =
  { ok: true; env: SandboxEnv } | { ok: false; detail: string };

export function parseSandboxEnv(env: NodeJS.ProcessEnv): EnvResult {
  const parsed = SandboxEnvSchema.safeParse(env);
  if (parsed.success) return { ok: true, env: parsed.data };
  const detail = parsed.error.issues
    .map((i) => `${String(i.path[0])}: ${i.message}`)
    .join("; ");
  return { ok: false, detail };
}

export interface BwrapOptions {
  env: SandboxEnv;
  callerUid: number;
  /** See roBindArgs in ./sandbox-mounts — bwrap dies on a missing bind source. */
  exists?: (p: string) => boolean;
}

export function buildBwrapArgs(
  innerBin: string,
  innerArgs: string[],
  opts: BwrapOptions,
): string[] {
  if (opts.callerUid === 0)
    throw new Error("refusing to build sandbox args for a uid 0 caller");

  const {
    LOOP_SESSION_PROXY: proxy,
    LOOP_SESSION_WORKDIR: workdir,
    NO_PROXY: noProxy,
  } = opts.env;

  // The network namespace is deliberately NOT unshared, and it cannot be:
  // --unshare-net gives the sandbox a private loopback, while the session's only
  // route out is the squid listening on the *host's* 127.0.0.1:3128. Unsharing
  // would leave it with no network rather than a confined one.
  //
  // That does not collapse sessions into each other. Per-session confinement is
  // done at the proxy rather than the netns: session-proxy-identity (see
  // terraform/modules/vm/user-data/squid.sh) mints a fresh squid username and
  // password per session, squid denies anything unauthenticated
  // (http_access deny !session), and every line of the audit log is stamped with
  // the session name — so concurrent sandboxes stay separately authorised,
  // separately rate-limited and separately attributable. What they genuinely
  // share is the reachable network surface, and closing that is the host
  // firewall's job: the nftables output chain drops all egress that is not from
  // uid 0 or the proxy user.
  return [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    "--uid",
    SANDBOX_UID,
    "--gid",
    SANDBOX_GID,
    "--new-session",
    "--die-with-parent",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    ...roBindArgs(opts.exists),
    "--tmpfs",
    SANDBOX_HOME,
    "--setenv",
    "HOME",
    SANDBOX_HOME,
    "--bind",
    workdir,
    workdir,
    "--chdir",
    workdir,
    ...proxyArgs(proxy, noProxy),
    innerBin,
    ...innerArgs,
  ];
}
