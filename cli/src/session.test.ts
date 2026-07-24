import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearSession, getSession, SessionError, setSession, type SessionBundle } from "./session.js";

// The two assertions below check real POSIX mode bits (0600/0700), which Node
// cannot represent on Windows. `npm test` runs the whole suite on Linux in
// Docker, so on the default path these always execute. This guard only matters
// if someone runs `npm run test:unit` directly on a Windows host, where it
// skips them rather than failing spuriously.
const posixOnly = process.platform === "win32" ? it.skip : it;

const session: SessionBundle = {
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "session-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("session", () => {
  it("round-trips set then get", async () => {
    await setSession(session, dir);
    await expect(getSession(dir)).resolves.toEqual(session);
  });

  it("returns null when never set", async () => {
    await expect(getSession(dir)).resolves.toBeNull();
  });

  it("returns null after clear", async () => {
    await setSession(session, dir);
    await clearSession(dir);
    await expect(getSession(dir)).resolves.toBeNull();
  });

  it("clears without error when nothing is stored", async () => {
    await expect(clearSession(dir)).resolves.toBeUndefined();
  });

  it("overwrites a previous session", async () => {
    await setSession(session, dir);
    const next = { access_token: "second-access", refresh_token: "second-refresh" };
    await setSession(next, dir);
    await expect(getSession(dir)).resolves.toEqual(next);
  });

  it("leaves no temporary files behind", async () => {
    await setSession(session, dir);
    await expect(readdir(dir)).resolves.toEqual(["session.json"]);
  });

  it("creates the store directory when missing", async () => {
    const nested = join(dir, "nested", ".agentjira");
    await setSession(session, nested);
    await expect(getSession(nested)).resolves.toEqual(session);
  });

  it("throws a typed error on a corrupt file", async () => {
    await writeFile(join(dir, "session.json"), "not json", "utf8");
    await expect(getSession(dir)).rejects.toBeInstanceOf(SessionError);
  });

  it("throws a typed error on a well-formed file with the wrong shape", async () => {
    await writeFile(join(dir, "session.json"), JSON.stringify({ access_token: "" }), "utf8");
    await expect(getSession(dir)).rejects.toBeInstanceOf(SessionError);
  });

  it("rejects an incomplete session without writing", async () => {
    await expect(setSession({ access_token: "a", refresh_token: "" }, dir)).rejects.toBeInstanceOf(
      SessionError,
    );
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  posixOnly("creates the session file with 0600 permissions", async () => {
    await setSession(session, dir);
    const mode = (await stat(join(dir, "session.json"))).mode & 0o777;
    expect(mode.toString(8)).toBe("600");
  });

  posixOnly("creates the store directory with 0700 permissions", async () => {
    const nested = join(dir, ".agentjira");
    await setSession(session, nested);
    const mode = (await stat(nested)).mode & 0o777;
    expect(mode.toString(8)).toBe("700");
  });

  it("stores only the session tokens", async () => {
    await setSession(session, dir);
    const contents = await readFile(join(dir, "session.json"), "utf8");
    expect(JSON.parse(contents)).toEqual(session);
  });
});
