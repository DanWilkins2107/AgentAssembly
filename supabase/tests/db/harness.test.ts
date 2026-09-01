import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedUsers } from "./seed.ts";

const USER = "00000000-0000-0000-0000-00000000f101";

describe("asAuthenticated", () => {
  it("takes the role and identity the policies read", async () => {
    await withRollback(async (sql) => {
      await seedUsers(sql, [USER]);
      await asAuthenticated(sql, USER, async () => {
        const { rows } = await sql.query<{ role: string; uid: string }>(
          `select current_user::text as role, auth.uid()::text as uid`,
        );
        expect(rows[0]).toEqual({ role: "authenticated", uid: USER });
      });
    });
  });

  it("gives the role back afterwards", async () => {
    await withRollback(async (sql) => {
      await seedUsers(sql, [USER]);
      await asAuthenticated(sql, USER, async () => {});
      const { rows } = await sql.query<{ role: string }>(`select current_user::text as role`);
      expect(rows[0].role).not.toBe("authenticated");
    });
  });
});
