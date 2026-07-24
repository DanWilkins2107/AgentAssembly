import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteUser, provisionUser, serviceRoleClient } from "./harness.js";

describe("password policy on authenticated update", () => {
  const admin = serviceRoleClient();
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await deleteUser(admin, userId);
      userId = null;
    }
  });

  it("rejects a weak password and accepts a compliant one", async () => {
    const email = `pwpolicy-${Date.now()}@example.com`;
    const password = "Str0ng-Passw0rd!23";
    userId = (await provisionUser(admin, { email, password })).id;

    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();

    const weak = await client.auth.updateUser({ password: "weak" });
    expect(weak.error).not.toBeNull();

    const compliant = await client.auth.updateUser({ password: "N3w-Str0ng-Passw0rd!" });
    expect(compliant.error).toBeNull();
  });
});
