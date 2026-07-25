import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteUser, provisionUser, serviceRoleClient } from "./harness.ts";

// Must match jwt_expiry in supabase/config.toml. Drift here SHOULD fail this test.
const JWT_EXPIRY_SECONDS = 3600;

function decodeJwtPayload(token: string): { iat: number; exp: number } {
  const segment = token.split(".")[1];
  return JSON.parse(Buffer.from(segment, "base64url").toString());
}

describe("access-token expiry", () => {
  const admin = serviceRoleClient();
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await deleteUser(admin, userId);
      userId = null;
    }
  });

  it("issues an access token that lives for jwt_expiry seconds", async () => {
    const email = `expiry-${Date.now()}@example.com`;
    const password = "Str0ng-Passw0rd!23";
    userId = (await provisionUser(admin, { email, password })).id;

    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    expect(error).toBeNull();

    const session = data.session!;
    const payload = decodeJwtPayload(session.access_token);
    expect(payload.exp - payload.iat).toBe(JWT_EXPIRY_SECONDS);
    expect(session.expires_in).toBe(JWT_EXPIRY_SECONDS);
  });
});
