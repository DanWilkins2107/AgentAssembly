import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { env } from "./env.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

export type SessionBundle = z.infer<typeof sessionSchema>;

export class SecretStoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SecretStoreError";
  }
}

export interface SecretStore {
  /** The account password from `AGENTJIRA_PASSWORD`; `null` when unset. Never persisted. */
  getPassword(): Promise<string | null>;
  /** The cached session, or `null` when none has been stored. */
  getSession(): Promise<SessionBundle | null>;
  /** Replaces the cached session. The file is created `0600`, written atomically. */
  setSession(session: SessionBundle): Promise<void>;
  /** Removes the cached session. A no-op when none is stored. */
  clearSession(): Promise<void>;
}

export function defaultStoreDir(): string {
  return join(homedir(), ".agentjira");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

export function createSecretStore(dir: string = defaultStoreDir()): SecretStore {
  const sessionPath = join(dir, "session.json");

  async function writeSessionFile(contents: string): Promise<void> {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const tempPath = join(dir, `.session.${randomBytes(8).toString("hex")}.tmp`);
    const handle = await open(tempPath, "wx", FILE_MODE);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(tempPath, sessionPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  return {
    async getPassword() {
      return env.AGENTJIRA_PASSWORD ?? null;
    },

    async getSession() {
      let contents: string;
      try {
        contents = await readFile(sessionPath, "utf8");
      } catch (error) {
        if (isMissing(error)) return null;
        throw new SecretStoreError(`failed to read session file at ${sessionPath}`, error);
      }

      let value: unknown;
      try {
        value = JSON.parse(contents);
      } catch {
        throw new SecretStoreError(`session file at ${sessionPath} is not valid JSON`);
      }

      const parsed = sessionSchema.safeParse(value);
      if (!parsed.success) {
        throw new SecretStoreError(`session file at ${sessionPath} is not a valid session`);
      }
      return parsed.data;
    },

    async setSession(session) {
      const validated = sessionSchema.safeParse(session);
      if (!validated.success) {
        throw new SecretStoreError("session must have a non-empty access_token and refresh_token");
      }
      try {
        await writeSessionFile(JSON.stringify(validated.data));
      } catch (error) {
        throw new SecretStoreError(`failed to write session file at ${sessionPath}`, error);
      }
    },

    async clearSession() {
      try {
        await unlink(sessionPath);
      } catch (error) {
        if (isMissing(error)) return;
        throw new SecretStoreError(`failed to remove session file at ${sessionPath}`, error);
      }
    },
  };
}
