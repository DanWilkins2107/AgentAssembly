import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedProject, seedUsers } from "./seed.ts";

const OWNER = "00000000-0000-0000-0000-0000000000e1";
const CO_MEMBER = "00000000-0000-0000-0000-0000000000e2";
const OUTSIDER = "00000000-0000-0000-0000-0000000000e3";
const PROJECT = "00000000-0000-0000-0000-0000000000e9";

async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [OWNER, CO_MEMBER, OUTSIDER]);
  await seedProject(sql, PROJECT, OWNER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'agent')`,
    [PROJECT, OWNER, CO_MEMBER],
  );
}

async function visibleMembers(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ user_id: string }>(
    `select user_id from public.project_members order by user_id`,
  );
  return rows.map((row) => row.user_id);
}

// A refused statement aborts the transaction, which would then reject the
// role reset on the way out. The savepoint keeps the failure local.
async function attempt(sql: Client, statement: string, params: unknown[]): Promise<string> {
  await sql.query("savepoint attempt");
  try {
    await sql.query(statement, params);
    return "allowed";
  } catch (error) {
    await sql.query("rollback to savepoint attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("project_members select policy", () => {
  it("shows a member their own row", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        expect(await visibleMembers(sql)).toEqual([OWNER]);
      });
    });
  });

  it("hides a co-member's row from a member of the same project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, CO_MEMBER, async () => {
        expect(await visibleMembers(sql)).toEqual([CO_MEMBER]);
      });
    });
  });

  it("shows a non-member nothing, without recursing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleMembers(sql)).toEqual([]);
      });
    });
  });
});

describe("project_members write grants", () => {
  it("refuses an insert from a signed-in member", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        const outcome = await attempt(
          sql,
          `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'agent')`,
          [PROJECT, OUTSIDER],
        );
        expect(outcome).toBe("42501");
      });
    });
  });

  it("refuses an update from a signed-in member", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        const outcome = await attempt(
          sql,
          `update public.project_members set role = 'agent' where user_id = $1`,
          [OWNER],
        );
        expect(outcome).toBe("42501");
      });
    });
  });

  it("refuses a delete from a signed-in member", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        const outcome = await attempt(
          sql,
          `delete from public.project_members where user_id = $1`,
          [OWNER],
        );
        expect(outcome).toBe("42501");
      });
    });
  });
});
