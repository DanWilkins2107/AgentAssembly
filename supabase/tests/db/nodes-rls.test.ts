import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedNodes, seedProject, seedUsers } from "./seed.ts";

const MEMBER = "00000000-0000-0000-0000-000000000101";
const OTHER_MEMBER = "00000000-0000-0000-0000-000000000102";
const OUTSIDER = "00000000-0000-0000-0000-000000000103";
const MINE = "00000000-0000-0000-0000-000000000110";
const THEIRS = "00000000-0000-0000-0000-000000000111";
const MY_NODE = "00000000-0000-0000-0000-000000000120";
const THEIR_NODE = "00000000-0000-0000-0000-000000000121";

// Two projects with a node each and no overlapping membership, so "only your
// own project's nodes" has something to be wrong about.
async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [MEMBER, OTHER_MEMBER, OUTSIDER]);
  await seedProject(sql, MINE, MEMBER);
  await seedProject(sql, THEIRS, OTHER_MEMBER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [MINE, MEMBER, THEIRS, OTHER_MEMBER],
  );
  await seedNodes(sql, [MY_NODE], MINE, MEMBER);
  await seedNodes(sql, [THEIR_NODE], THEIRS, OTHER_MEMBER);
}

async function visibleNodes(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ id: string }>(`select id from public.nodes order by id`);
  return rows.map((row) => row.id);
}

async function retitle(sql: Client, node: string): Promise<number> {
  const { rowCount } = await sql.query(`update public.nodes set title = 'Retitled' where id = $1`, [
    node,
  ]);
  return rowCount ?? 0;
}

// A refused statement aborts the transaction, so the savepoint keeps the failure
// local and lets asAuthenticated reset the role on the way out.
async function refusal(sql: Client, statement: string, params: unknown[] = []): Promise<string> {
  await sql.query("savepoint attempt");
  try {
    await sql.query(statement, params);
    return "allowed";
  } catch (caught) {
    await sql.query("rollback to savepoint attempt");
    const error = caught as { code?: string; message?: string };
    return `${error.code}: ${error.message}`;
  }
}

const VIOLATES_POLICY = '42501: new row violates row-level security policy for table "nodes"';

describe("nodes select policy", () => {
  it("shows a member the nodes of their own project and no others", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await visibleNodes(sql)).toEqual([MY_NODE]);
      });
    });
  });

  it("shows a non-member nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleNodes(sql)).toEqual([]);
      });
    });
  });
});

describe("nodes insert policy", () => {
  it("lets a member add a node to their own project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        const { rowCount } = await sql.query(
          `insert into public.nodes (project_id, title, status, created_by)
           values ($1, 'New node', 'human_braindump_needed', $2)`,
          [MINE, MEMBER],
        );
        expect(rowCount).toBe(1);
      });
    });
  });

  it("refuses a node in a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(
            sql,
            `insert into public.nodes (project_id, title, status, created_by)
             values ($1, 'Smuggled node', 'human_braindump_needed', $2)`,
            [THEIRS, MEMBER],
          ),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });
});

describe("nodes update policy", () => {
  it("lets a member retitle a node in their own project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await retitle(sql, MY_NODE)).toBe(1);
      });
    });
  });

  it("does not reach a node in a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await retitle(sql, THEIR_NODE)).toBe(0);
      });
    });
  });

  it("refuses moving a node into a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, `update public.nodes set project_id = $1 where id = $2`, [
            THEIRS,
            MY_NODE,
          ]),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });
});

describe("nodes delete", () => {
  it("refuses a member deleting their own node, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await refusal(sql, `delete from public.nodes where id = $1`, [MY_NODE])).toBe(
          "42501: permission denied for table nodes",
        );
      });
    });
  });
});
