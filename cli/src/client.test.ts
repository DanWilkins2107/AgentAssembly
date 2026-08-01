import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, connect } from "./client.js";
import { clearSession, getSession, setSession } from "./session.js";

// The real env.ts parses process.env at import time and throws when the vars
// are unset, which is exactly how the suite runs.
const { env } = vi.hoisted(() => ({
  env: {
    AGENTJIRA_URL: "https://store.example",
    AGENTJIRA_ANON_KEY: "anon-key",
    AGENTJIRA_EMAIL: "agent@example.com",
    AGENTJIRA_PASSWORD: "agent-password" as string | undefined,
  },
}));

vi.mock("./env.js", () => ({ env }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("./session.js", () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

const auth = { setSession: vi.fn(), signInWithPassword: vi.fn() };
const client = { auth };

function tokens(prefix: string) {
  return { access_token: `${prefix}-access`, refresh_token: `${prefix}-refresh` };
}

beforeEach(() => {
  vi.resetAllMocks();
  env.AGENTJIRA_PASSWORD = "agent-password";
  vi.mocked(createClient).mockReturnValue(client as never);
  vi.mocked(getSession).mockResolvedValue(null);
});

describe("connect", () => {
  it("builds the client with supabase's own persistence and refresh disabled", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: tokens("fresh") }, error: null });
    await expect(connect()).resolves.toBe(client);
    expect(createClient).toHaveBeenCalledWith("https://store.example", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("signs in with the env password when nothing is cached and persists the tokens", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: tokens("fresh") }, error: null });
    await expect(connect()).resolves.toBe(client);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "agent@example.com",
      password: "agent-password",
    });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith(tokens("fresh"));
  });

  it("resumes a cached session and persists the rotated tokens", async () => {
    vi.mocked(getSession).mockResolvedValue(tokens("cached"));
    auth.setSession.mockResolvedValue({ data: { session: tokens("rotated") }, error: null });
    await expect(connect()).resolves.toBe(client);
    expect(auth.setSession).toHaveBeenCalledWith(tokens("cached"));
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith(tokens("rotated"));
  });

  it("clears the cached session and throws when the refresh fails", async () => {
    const cause = new Error("token rejected");
    vi.mocked(getSession).mockResolvedValue(tokens("cached"));
    auth.setSession.mockResolvedValue({ data: { session: null }, error: cause });
    const error = (await connect().catch((thrown: unknown) => thrown)) as AuthError;
    expect(error).toBeInstanceOf(AuthError);
    expect(error.name).toBe("AuthError");
    expect(error.message).toMatch(/failed to refresh the cached session/);
    expect(error.cause).toBe(cause);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("clears the session and throws when the password sign-in fails", async () => {
    const failure = { data: { session: null }, error: new Error("invalid credentials") };
    auth.signInWithPassword.mockResolvedValue(failure);
    await expect(connect()).rejects.toThrow(/failed to sign in/);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("throws without reaching supabase when no password is set and nothing is cached", async () => {
    env.AGENTJIRA_PASSWORD = undefined;
    const failure = connect();
    await expect(failure).rejects.toBeInstanceOf(AuthError);
    await expect(failure).rejects.toThrow(/AGENTJIRA_PASSWORD/);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });
});
