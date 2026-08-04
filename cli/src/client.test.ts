import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, connect } from "./client.js";
import { clearSession, getSession, setSession } from "./session.js";

// The AGENTJIRA_* values asserted below are pinned by test.env in vitest.config.ts.
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("./session.js", () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

// Fake supabase client: connect() only touches .auth and hands the object back.
// Cast at the mock boundary below because the real type has ~40 more members.
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

  it("signs in with the password when the cached session is too stale to resume", async () => {
    vi.mocked(getSession).mockResolvedValue(tokens("stale"));
    auth.setSession.mockResolvedValue({ data: { session: null }, error: new Error("expired") });
    auth.signInWithPassword.mockResolvedValue({ data: { session: tokens("fresh") }, error: null });
    await expect(connect()).resolves.toBe(supabaseClient);
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(setSession).toHaveBeenCalledWith(tokens("fresh"));
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("clears the session and throws when the password sign-in fails", async () => {
    const cause = new Error("invalid credentials");
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: cause });
    const error = await connect().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ name: "AuthError", message: "failed to sign in", cause });
    expect(clearSession).toHaveBeenCalledOnce();
    expect(setSession).not.toHaveBeenCalled();
  });
});
