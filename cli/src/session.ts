import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

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
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
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
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const tempPath = join(dir, `.session.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(tempPath, "wx", FILE_MODE);
    try {
      await handle.writeFile(JSON.stringify(validated.data), "utf8");
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
