import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteUser, provisionUser, serviceRoleClient } from "./harness.ts";

// Must match refresh_token_reuse_interval in supabase/config.toml (seconds).
const REFRESH_REUSE_INTERVAL_SECONDS = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("refresh-token rotation + reuse", () => {
  const admin = serviceRoleClient();
  let userId: string | null = null;

  async function signInRefreshToken(email: string, password: string): Promise<string> {
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return data.session!.refresh_token;
  }

  afterEach(async () => {
    if (userId) {
      await deleteUser(admin, userId);
      userId = null;
    }
  });

  it("rotates the refresh token on use (single-use)", async () => {
    const email = `rotate-${Date.now()}@example.com`;
    const password = "Str0ng-Passw0rd!23";
    userId = (await provisionUser(admin, { email, password })).id;

    const r0 = await signInRefreshToken(email, password);
    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: r0 });
    expect(error).toBeNull();
    expect(data.session!.refresh_token).not.toBe(r0);
    expect(data.session!.access_token).toBeTruthy();
  });

  it("forgives an in-interval reuse of the rotated token", async () => {
    const email = `reuse-in-${Date.now()}@example.com`;
    const password = "Str0ng-Passw0rd!23";
    userId = (await provisionUser(admin, { email, password })).id;

    const r0 = await signInRefreshToken(email, password);
    const first = await anonClient().auth.refreshSession({ refresh_token: r0 });
    expect(first.error).toBeNull();
    const r1 = first.data.session!.refresh_token;

    const race = await anonClient().auth.refreshSession({ refresh_token: r0 });
    expect(race.error).toBeNull();
    expect(race.data.session).not.toBeNull();

    const descendant = await anonClient().auth.refreshSession({ refresh_token: r1 });
    expect(descendant.error).toBeNull();
  });

  // GoTrue only rejects reuse of a token whose own child was already consumed,
  // and past the interval. Reuse does NOT revoke the family here: the live tip
  // keeps refreshing. (Family-revocation-on-reuse is not this version's behavior.)
  it(
    "rejects a superseded token reused after the interval, without revoking the family",
    { timeout: 20000 },
    async () => {
      const email = `reuse-after-${Date.now()}@example.com`;
      const password = "Str0ng-Passw0rd!23";
      userId = (await provisionUser(admin, { email, password })).id;

      const r0 = await signInRefreshToken(email, password);
      const first = await anonClient().auth.refreshSession({ refresh_token: r0 });
      expect(first.error).toBeNull();
      const r1 = first.data.session!.refresh_token;

      const second = await anonClient().auth.refreshSession({ refresh_token: r1 });
      expect(second.error).toBeNull();
      const r2 = second.data.session!.refresh_token;

      await sleep((REFRESH_REUSE_INTERVAL_SECONDS + 2) * 1000);

      const reused = await anonClient().auth.refreshSession({ refresh_token: r0 });
      expect(reused.error).not.toBeNull();

      const tip = await anonClient().auth.refreshSession({ refresh_token: r2 });
      expect(tip.error).toBeNull();
    },
  );
});
