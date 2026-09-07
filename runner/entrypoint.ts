import { spawn } from "node:child_process";

// Exit code when invoked with no/invalid CLI args (usage error).
export const USAGE_EXIT = 2;

export const CLAUDE_ARGS = [
  "--print",
  "--permission-mode",
  "auto",
  "--no-session-persistence",
  "--output-format",
  "json",
];

export function parseNodeIdArg(argv: string[], printUsage: () => void): string {
  const [nodeId] = argv;
  if (nodeId === undefined || nodeId === "-h" || nodeId === "--help") {
    printUsage();
    process.exit(nodeId === undefined ? USAGE_EXIT : 0);
  }
  return nodeId;
}

export function makeLog(prefix: string): (...args: string[]) => void {
  return (...args) => process.stderr.write(`[${prefix}] ${args.join(" ")}\n`);
}

// One machine-readable result line to stdout, then exit with the mapped code.
// Callers own the enum→code mapping and the payload's variant fields.
export function emitResult(
  nodeId: string | null,
  exitCode: number,
  payload: Record<string, unknown>,
): never {
  process.stdout.write(JSON.stringify({ node_id: nodeId, ...payload }) + "\n");
  process.exit(exitCode);
}

type WhoamiRun =
  | { spawned: false; error: string }
  | { spawned: true; code: number | null; stdout: string; stderr: string };

// Run `aj whoami --json` to completion, capturing both streams. A child that
// never starts resolves as `spawned: false` rather than throwing, so the caller
// stays a flat sequence of checks.
function runWhoami(): Promise<WhoamiRun> {
  return new Promise((resolve) => {
    const child = spawn("aj", ["whoami", "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve({ spawned: false, error: e.message }));
    child.on("close", (code) =>
      resolve({ spawned: true, code, stdout, stderr }),
    );
  });
}

// A clean exit still has to carry JSON: garbled output means the auth check
// never really answered.
function whoamiParsed(
  stdout: string,
): { ok: true } | { ok: false; detail: string } {
  try {
    JSON.parse(stdout);
    return { ok: true };
  } catch {
    return { ok: false, detail: "`aj whoami` returned unparseable output" };
  }
}

function notAuthenticated(code: number | null, stderr: string): string {
  const reason =
    stderr.trim() ||
    "no auth resolved from env vars or ~/.agentjira/config.json";
  return `\`aj\` not authenticated (whoami exit=${code}): ${reason}`;
}

// `aj` has to be on PATH and authenticated before a session is worth starting.
export async function preflight(): Promise<
  { ok: true } | { ok: false; detail: string }
> {
  const run = await runWhoami();
  if (!run.spawned) {
    return { ok: false, detail: `\`aj\` not runnable: ${run.error}` };
  }
  if (run.code !== 0) {
    return { ok: false, detail: notAuthenticated(run.code, run.stderr) };
  }
  return whoamiParsed(run.stdout);
}
