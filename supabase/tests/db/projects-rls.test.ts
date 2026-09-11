import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedProject, seedUsers } from "./seed.ts";

const OWNER = "00000000-0000-0000-0000-0000000000d1";
const AGENT = "00000000-0000-0000-0000-0000000000d2";
const OUTSIDER = "00000000-0000-0000-0000-0000000000d3";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000000d4";
const OWNED = "00000000-0000-0000-0000-0000000000da";
const OTHER = "00000000-0000-0000-0000-0000000000db";

// OWNER owns OWNED and is a plain agent on OTHER: role is per project, so the
// two rows are what the owner-only policy has to tell apart.
async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [OWNER, AGENT, OUTSIDER, OTHER_OWNER]);
  await seedProject(sql, OWNED, OWNER);
  await seedProject(sql, OTHER, OTHER_OWNER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'agent'), ($4, $5, 'owner'), ($4, $2, 'agent')`,
    [OWNED, OWNER, AGENT, OTHER, OTHER_OWNER],
  );
}

async function visibleProjects(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ id: string }>(`select id from public.projects order by id`);
  return rows.map((row) => row.id);
}

async function rename(sql: Client, project: string): Promise<number> {
  const { rowCount } = await sql.query(`update public.projects set name = 'Renamed' where id = $1`, [
    project,
  ]);
  return rowCount ?? 0;
}

// A refused statement aborts the transaction, so the savepoint keeps the failure
// local and lets asAuthenticated reset the role on the way out.
async function refusal(sql: Client, statement: string): Promise<string> {
  await sql.query("savepoint attempt");
  try {
    await sql.query(statement);
    return "allowed";
  } catch (caught) {
    await sql.query("rollback to savepoint attempt");
    const error = caught as { code?: string; message?: string };
    return `${error.code}: ${error.message}`;
  }
}

describe("projects select policy", () => {
  it("shows a member every project they belong to, whatever the role", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        expect(await visibleProjects(sql)).toEqual([OWNED, OTHER]);
      });
    });
  });

  it("hides a project the caller has no row on", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, AGENT, async () => {
        expect(await visibleProjects(sql)).toEqual([OWNED]);
      });
    });
  });

  it("shows a non-member nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleProjects(sql)).toEqual([]);
      });
    });
  });

  it("refuses webhook_secret to an owner who can read the rest of the row", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        const { rows } = await sql.query<{ name: string }>(
          `select name from public.projects where id = $1`,
          [OWNED],
        );
        expect(rows).toEqual([{ name: "Test project" }]);
        expect(await refusal(sql, `select webhook_secret from public.projects`)).toBe(
          "42501: permission denied for table projects",
        );
      });
    });
  });
});

describe("projects update policy", () => {
  it("lets an owner rename their own project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        expect(await rename(sql, OWNED)).toBe(1);
      });
    });
  });

  it("does not let an agent member rename the project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, AGENT, async () => {
        expect(await rename(sql, OWNED)).toBe(0);
      });
    });
  });

  it("does not let an owner rename a project they are only an agent on", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        expect(await rename(sql, OTHER)).toBe(0);
      });
    });
  });

  it("refuses an owner the authorship columns", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OWNER, async () => {
        for (const column of ["id", "created_by", "created_at"]) {
          expect(
            await refusal(sql, `update public.projects set ${column} = ${column} where false`),
          ).toBe("42501: permission denied for table projects");
        }
      });
    });
  });
});
