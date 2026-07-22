import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSecretStore, SecretStoreError, type SessionBundle } from "./secret-store.js";

const posixOnly = process.platform === "win32" ? it.skip : it;

const session: SessionBundle = {
  access_token: "access-token-value",
  refresh_token: "refresh-token-value",
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "secret-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("getPassword", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadStore() {
    vi.resetModules();
    const { createSecretStore: create } = await import("./secret-store.js");
    return create(dir);
  }

  it("returns the environment value when set", async () => {
    vi.stubEnv("AGENTJIRA_PASSWORD", "hunter2");
    const store = await loadStore();
    await expect(store.getPassword()).resolves.toBe("hunter2");
  });

  it("returns null when unset", async () => {
    vi.stubEnv("AGENTJIRA_PASSWORD", undefined);
    const store = await loadStore();
    await expect(store.getPassword()).resolves.toBeNull();
  });

  it("writes nothing to disk", async () => {
    vi.stubEnv("AGENTJIRA_PASSWORD", "hunter2");
    const store = await loadStore();
    await store.getPassword();
    await expect(readdir(dir)).resolves.toEqual([]);
  });
});

describe("session", () => {
  it("round-trips set then get", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    await expect(store.getSession()).resolves.toEqual(session);
  });

  it("returns null when never set", async () => {
    const store = createSecretStore(dir);
    await expect(store.getSession()).resolves.toBeNull();
  });

  it("returns null after clear", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    await store.clearSession();
    await expect(store.getSession()).resolves.toBeNull();
  });

  it("clears without error when nothing is stored", async () => {
    const store = createSecretStore(dir);
    await expect(store.clearSession()).resolves.toBeUndefined();
  });

  it("overwrites a previous session", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    const next = { access_token: "second-access", refresh_token: "second-refresh" };
    await store.setSession(next);
    await expect(store.getSession()).resolves.toEqual(next);
  });

  it("leaves no temporary files behind", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    await expect(readdir(dir)).resolves.toEqual(["session.json"]);
  });

  it("creates the store directory when missing", async () => {
    const nested = join(dir, "nested", ".agentjira");
    const store = createSecretStore(nested);
    await store.setSession(session);
    await expect(store.getSession()).resolves.toEqual(session);
  });

  it("throws a typed error on a corrupt file", async () => {
    await writeFile(join(dir, "session.json"), "not json", "utf8");
    const store = createSecretStore(dir);
    await expect(store.getSession()).rejects.toBeInstanceOf(SecretStoreError);
  });

  it("throws a typed error on a well-formed file with the wrong shape", async () => {
    await writeFile(join(dir, "session.json"), JSON.stringify({ access_token: "" }), "utf8");
    const store = createSecretStore(dir);
    await expect(store.getSession()).rejects.toBeInstanceOf(SecretStoreError);
  });

  it("rejects an incomplete session without writing", async () => {
    const store = createSecretStore(dir);
    await expect(
      store.setSession({ access_token: "a", refresh_token: "" }),
    ).rejects.toBeInstanceOf(SecretStoreError);
    await expect(readdir(dir)).resolves.toEqual([]);
  });

  posixOnly("creates the session file with 0600 permissions", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    const mode = (await stat(join(dir, "session.json"))).mode & 0o777;
    expect(mode.toString(8)).toBe("600");
  });

  posixOnly("creates the store directory with 0700 permissions", async () => {
    const nested = join(dir, ".agentjira");
    const store = createSecretStore(nested);
    await store.setSession(session);
    const mode = (await stat(nested)).mode & 0o777;
    expect(mode.toString(8)).toBe("700");
  });

  it("stores only the session tokens", async () => {
    const store = createSecretStore(dir);
    await store.setSession(session);
    const contents = await readFile(join(dir, "session.json"), "utf8");
    expect(JSON.parse(contents)).toEqual(session);
  });
});
