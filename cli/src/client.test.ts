import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, connect } from "./client.js";
import { clearSession, getSession, setSession } from "./session.js";

// The real env.ts parses process.env at import time and throws when the vars
// are unset, which is how CI runs the suite, so it is replaced wholesale.
vi.mock("./env.js", () => ({
  env: {
    AGENTJIRA_URL: "https://store.example",
    AGENTJIRA_ANON_KEY: "anon-key",
    AGENTJIRA_EMAIL: "agent@example.com",
    AGENTJIRA_PASSWORD: "agent-password",
  },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("./session.js", () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

// Stands in for the object createClient returns. connect() only ever touches
// .auth on it and hands it back untouched, so the two methods it calls are the
// whole stub. Widening to never at the mock boundary below is the one cast left
// here: a real SupabaseClient has ~40 more members and is generic over the
// database schema, so no honest annotation makes this object one.
const auth = { setSession: vi.fn(), signInWithPassword: vi.fn() };
const supabaseClient = { auth };

function tokens(prefix: string) {
  return { access_token: `${prefix}-access`, refresh_token: `${prefix}-refresh` };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createClient).mockReturnValue(supabaseClient as never);
  vi.mocked(getSession).mockResolvedValue(null);
});

describe("connect", () => {
  it("keeps supabase-js off disk and off timers, leaving session.ts the only store", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: tokens("fresh") }, error: null });
    await expect(connect()).resolves.toBe(supabaseClient);
    expect(createClient).toHaveBeenCalledWith("https://store.example", "anon-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("signs in with the env password when nothing is cached and persists the tokens", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: tokens("fresh") }, error: null });
    await expect(connect()).resolves.toBe(supabaseClient);
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
    await expect(connect()).resolves.toBe(supabaseClient);
    expect(auth.setSession).toHaveBeenCalledWith(tokens("cached"));
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith(tokens("rotated"));
  });

  it("clears the cached session and throws when the refresh fails", async () => {
    const cause = new Error("token rejected");
    vi.mocked(getSession).mockResolvedValue(tokens("cached"));
    auth.setSession.mockResolvedValue({ data: { session: null }, error: cause });
    const error = await connect().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({
      name: "AuthError",
      message: expect.stringMatching(/failed to refresh the cached session/),
      cause,
    });
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
});
