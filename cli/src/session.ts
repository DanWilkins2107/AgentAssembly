import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// Octal Unix permission bits, applied when the directory/file are created:
//   0o700 = owner-only directory, 0o600 = owner read/write file.
// This keeps the cached tokens unreadable by other users on the box. Linux is
// the only supported runtime; the tests fail loudly if run elsewhere.
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type SessionBundle = z.infer<typeof sessionSchema>;

export class SessionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SessionError";
  }
}

export function sessionDir(): string {
  return join(homedir(), ".agentjira");
}

function sessionPath(dir: string): string {
  return join(dir, "session.json");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

// Parse + validate on-disk contents; throws SessionError on bad JSON or shape.
function parseSession(contents: string, path: string): SessionBundle {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new SessionError(`session file at ${path} is not valid JSON`);
  }
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) {
    throw new SessionError(`session file at ${path} is not a valid session`);
  }
  return parsed.data;
}

// Write atomically and with tight perms: create a 0600 temp file in the same
// dir, flush it, then rename it over the target. No partial or loosely
// permissioned file is ever visible at the target path.
async function writeFileAtomic(dir: string, path: string, data: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const tempPath = join(dir, `.session.${randomBytes(8).toString("hex")}.tmp`);
  const handle = await open(tempPath, "wx", FILE_MODE);
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

export async function getSession(dir: string = sessionDir()): Promise<SessionBundle | null> {
  const path = sessionPath(dir);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw new SessionError(`failed to read session file at ${path}`, error);
  }
  return parseSession(contents, path);
}

export async function setSession(
  session: SessionBundle,
  dir: string = sessionDir(),
): Promise<void> {
  const validated = sessionSchema.safeParse(session);
  if (!validated.success) {
    throw new SessionError("session must have a non-empty access_token and refresh_token");
  }
  const path = sessionPath(dir);
  try {
    await writeFileAtomic(dir, path, JSON.stringify(validated.data));
  } catch (error) {
    throw new SessionError(`failed to write session file at ${path}`, error);
  }
}

export async function clearSession(dir: string = sessionDir()): Promise<void> {
  const path = sessionPath(dir);
  try {
    await unlink(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw new SessionError(`failed to remove session file at ${path}`, error);
  }
}
