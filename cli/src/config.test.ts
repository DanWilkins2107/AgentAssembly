import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configDir, ConfigError, loadConfig } from "./config.js";

const file = {
  connection: { url: "https://file.supabase.co", anon_key: "file-anon-key" },
  default_project: "agentassembly",
  projects: {
    agentassembly: { email: "agent@example.com" },
    other: { email: "other@example.com" },
  },
};

let dir: string;

async function writeConfig(contents: unknown): Promise<void> {
  const serialized = typeof contents === "string" ? contents : JSON.stringify(contents);
  await writeFile(join(dir, "config.json"), serialized, "utf8");
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "config-"));
  vi.stubEnv("AGENTJIRA_URL", undefined);
  vi.stubEnv("AGENTJIRA_ANON_KEY", undefined);
  vi.stubEnv("AGENTJIRA_EMAIL", undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("resolves connection and identity from the file via default_project", async () => {
    await writeConfig(file);
    expect(loadConfig(undefined, dir)).toEqual({
      connection: { url: "https://file.supabase.co", anon_key: "file-anon-key" },
      identity: { email: "agent@example.com" },
    });
  });

  it("loads from env alone with no file present", () => {
    vi.stubEnv("AGENTJIRA_URL", "https://env.supabase.co");
    vi.stubEnv("AGENTJIRA_ANON_KEY", "env-anon-key");
    vi.stubEnv("AGENTJIRA_EMAIL", "env@example.com");
    expect(loadConfig(undefined, dir)).toEqual({
      connection: { url: "https://env.supabase.co", anon_key: "env-anon-key" },
      identity: { email: "env@example.com" },
    });
  });

  it("prefers AGENTJIRA_URL over the file", async () => {
    await writeConfig(file);
    vi.stubEnv("AGENTJIRA_URL", "https://env.supabase.co");
    expect(loadConfig(undefined, dir).connection).toEqual({
      url: "https://env.supabase.co",
      anon_key: "file-anon-key",
    });
  });

  it("prefers AGENTJIRA_ANON_KEY over the file", async () => {
    await writeConfig(file);
    vi.stubEnv("AGENTJIRA_ANON_KEY", "env-anon-key");
    expect(loadConfig(undefined, dir).connection).toEqual({
      url: "https://file.supabase.co",
      anon_key: "env-anon-key",
    });
  });

  it("prefers AGENTJIRA_EMAIL over the file", async () => {
    await writeConfig(file);
    vi.stubEnv("AGENTJIRA_EMAIL", "env@example.com");
    expect(loadConfig(undefined, dir).identity).toEqual({ email: "env@example.com" });
  });

  it("selects the project named in the argument over default_project", async () => {
    await writeConfig(file);
    expect(loadConfig("other", dir).identity).toEqual({ email: "other@example.com" });
  });

  it("throws naming the known projects when the project is unknown", async () => {
    await writeConfig(file);
    const failure = () => loadConfig("nope", dir);
    expect(failure).toThrow(ConfigError);
    expect(failure).toThrow(/unknown project "nope"/);
    expect(failure).toThrow(/known projects: agentassembly, other/);
  });

  it("throws naming AGENTJIRA_EMAIL when no project resolves", async () => {
    await writeConfig({ connection: file.connection, projects: file.projects });
    const failure = () => loadConfig(undefined, dir);
    expect(failure).toThrow(ConfigError);
    expect(failure).toThrow(/missing AGENTJIRA_EMAIL: set the env var or add it to/);
  });

  it("throws naming AGENTJIRA_URL when it is missing", async () => {
    await writeConfig({ connection: { anon_key: "file-anon-key" } });
    expect(() => loadConfig(undefined, dir)).toThrow(/missing AGENTJIRA_URL/);
  });

  it("throws naming AGENTJIRA_ANON_KEY when it is missing", async () => {
    await writeConfig({ connection: { url: "https://file.supabase.co" } });
    expect(() => loadConfig(undefined, dir)).toThrow(/missing AGENTJIRA_ANON_KEY/);
  });

  it("throws a typed error on a corrupt file, keeping the parse failure as its cause", async () => {
    await writeConfig("not json");
    let error: unknown;
    try {
      loadConfig(undefined, dir);
    } catch (thrown: unknown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toMatch(/is not valid JSON/);
    expect((error as ConfigError).cause).toBeInstanceOf(SyntaxError);
  });

  it("throws a typed error on a well-formed file with the wrong shape", async () => {
    await writeConfig({ connection: { url: "not-a-url", anon_key: "file-anon-key" } });
    const failure = () => loadConfig(undefined, dir);
    expect(failure).toThrow(ConfigError);
    expect(failure).toThrow(/is not a valid config/);
  });

  it("strips a password planted in the file", async () => {
    await writeConfig({
      ...file,
      password: "planted-secret",
      connection: { ...file.connection, password: "planted-secret" },
    });
    const config = loadConfig(undefined, dir);
    expect(config).toEqual({
      connection: { url: "https://file.supabase.co", anon_key: "file-anon-key" },
      identity: { email: "agent@example.com" },
    });
    expect(JSON.stringify(config)).not.toContain("planted-secret");
  });

  it("defaults the config location to ~/.agentjira", () => {
    expect(configDir()).toBe(join(homedir(), ".agentjira"));
  });
});
