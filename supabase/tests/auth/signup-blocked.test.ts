import { describe, expect, it } from "vitest";
import { anonClient } from "./harness.js";

describe("public signup", () => {
  it("is rejected for anonymous callers", async () => {
    const anon = anonClient();
    const { data, error } = await anon.auth.signUp({
      email: `signup-blocked-${Date.now()}@example.com`,
      password: "Str0ng-Passw0rd!23",
    });

    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    expect(data.session).toBeNull();
  });
});
