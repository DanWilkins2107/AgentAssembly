import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configDir, ConfigError, loadConfig } from "./config.js";

vi.mock("node:fs");

const file = {
  connection: { url: "https://file.supabase.co", anon_key: "file-anon-key" },
  default_project: "agentassembly",
  projects: { agentassembly: { email: "agent@example.com" } },
};

function nonMissing(): NodeJS.ErrnoException {
  const error = new Error("boom") as NodeJS.ErrnoException;
  error.code = "EACCES";
  return error;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AGENTJIRA_URL", undefined);
  vi.stubEnv("AGENTJIRA_ANON_KEY", undefined);
  vi.stubEnv("AGENTJIRA_EMAIL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config fs failures", () => {
  it("wraps a non-ENOENT read failure in ConfigError", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw nonMissing();
    });
    const failure = () => loadConfig(undefined, "/store");
    expect(failure).toThrow(ConfigError);
    expect(failure).toThrow(/failed to read config file at/);
  });

  it("names the error and keeps the underlying fs error as its cause", () => {
    const cause = nonMissing();
    vi.mocked(readFileSync).mockImplementation(() => {
      throw cause;
    });
    let error: unknown;
    try {
      loadConfig(undefined, "/store");
    } catch (thrown: unknown) {
      error = thrown;
    }
    expect((error as ConfigError).name).toBe("ConfigError");
    expect((error as ConfigError).cause).toBe(cause);
  });

  it("reads config.json from the default dir when none is given", () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(file));
    expect(loadConfig()).toEqual({
      connection: { url: "https://file.supabase.co", anon_key: "file-anon-key" },
      identity: { email: "agent@example.com" },
    });
    expect(readFileSync).toHaveBeenCalledWith(join(configDir(), "config.json"), "utf8");
  });
});
