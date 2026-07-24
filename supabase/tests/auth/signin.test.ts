import { afterEach, describe, expect, it } from "vitest";
import { anonClient, deleteUser, provisionUser, serviceRoleClient } from "./harness.ts";

describe("provisioned-user sign-in", () => {
  const admin = serviceRoleClient();
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await deleteUser(admin, userId);
      userId = null;
    }
  });

  it("succeeds with the provisioned credentials", async () => {
    const email = `signin-${Date.now()}@example.com`;
    const password = "Str0ng-Passw0rd!23";
    userId = (await provisionUser(admin, { email, password })).id;

    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.user?.id).toBe(userId);
  });
});
