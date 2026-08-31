import { existsSync } from "node:fs";
import { z } from "zod";

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

// Named binds, never a blanket /etc: the whole directory would hand the session
// /etc/agentassembly/loop.env (root:loop 0640) — its own proxy password.
const RO_PATHS = [
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib32",
  "/lib64",
  "/opt",
  "/etc/ssl/certs",
  "/etc/resolv.conf",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/passwd",
  "/etc/group",
];

const SANDBOX_HOME = "/home/agent";
const SANDBOX_UID = "1000";
const SANDBOX_GID = "1000";

export interface BwrapOptions {
  env: SandboxEnv;
  callerUid: number;
  exists?: (p: string) => boolean;
}

function roBindArgs(exists: (p: string) => boolean): string[] {
  const args: string[] = [];
  for (const p of RO_PATHS) {
    if (exists(p)) args.push("--ro-bind", p, p);
  }
  return args;
}

// Both casings plus GIT_CONFIG_* so git cannot bypass the proxy.
function proxyArgs(proxy: string, noProxy: string | undefined): string[] {
  const args = [
    "--setenv",
    "HTTPS_PROXY",
    proxy,
    "--setenv",
    "https_proxy",
    proxy,
    "--setenv",
    "HTTP_PROXY",
    proxy,
    "--setenv",
    "http_proxy",
    proxy,
    "--setenv",
    "GIT_CONFIG_COUNT",
    "1",
    "--setenv",
    "GIT_CONFIG_KEY_0",
    "http.proxy",
    "--setenv",
    "GIT_CONFIG_VALUE_0",
    proxy,
  ];
  if (noProxy)
    args.push("--setenv", "NO_PROXY", noProxy, "--setenv", "no_proxy", noProxy);
  return args;
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

  // The network namespace is deliberately NOT unshared: the session must reach
  // the host-local proxy. Network confinement is the host firewall's job.
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
    ...roBindArgs(opts.exists ?? existsSync),
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
