import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedNodes, seedProject, seedUsers } from "./seed.ts";

const MEMBER = "00000000-0000-0000-0000-000000000201";
const OTHER_MEMBER = "00000000-0000-0000-0000-000000000202";
const OUTSIDER = "00000000-0000-0000-0000-000000000203";
const MINE = "00000000-0000-0000-0000-000000000210";
const THEIRS = "00000000-0000-0000-0000-000000000211";
const MY_SOURCE = "00000000-0000-0000-0000-000000000220";
const MY_TARGET = "00000000-0000-0000-0000-000000000221";
const THEIR_SOURCE = "00000000-0000-0000-0000-000000000222";
const THEIR_TARGET = "00000000-0000-0000-0000-000000000223";
const MY_EDGE = "00000000-0000-0000-0000-000000000230";
const THEIR_EDGE = "00000000-0000-0000-0000-000000000231";

// Two projects, each with a pair of nodes and an edge between them, and no
// overlapping membership -- so "only your own project's edges" has something to
// be wrong about. Without it a predicate whose project_id resolves to
// project_members' own column reads as correct.
async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [MEMBER, OTHER_MEMBER, OUTSIDER]);
  await seedProject(sql, MINE, MEMBER);
  await seedProject(sql, THEIRS, OTHER_MEMBER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [MINE, MEMBER, THEIRS, OTHER_MEMBER],
  );
  await seedNodes(sql, [MY_SOURCE, MY_TARGET], MINE, MEMBER);
  await seedNodes(sql, [THEIR_SOURCE, THEIR_TARGET], THEIRS, OTHER_MEMBER);
  await sql.query(
    `insert into public.edges (id, project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, $4, 'subtask', $5), ($6, $7, $8, $9, 'subtask', $10)`,
    [
      MY_EDGE,
      MINE,
      MY_SOURCE,
      MY_TARGET,
      MEMBER,
      THEIR_EDGE,
      THEIRS,
      THEIR_SOURCE,
      THEIR_TARGET,
      OTHER_MEMBER,
    ],
  );
}

async function visibleEdges(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ id: string }>(`select id from public.edges order by id`);
  return rows.map((row) => row.id);
}

async function remove(sql: Client, edge: string): Promise<number> {
  const { rowCount } = await sql.query(`update public.edges set removed_at = now() where id = $1`, [
    edge,
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

const VIOLATES_POLICY = '42501: new row violates row-level security policy for table "edges"';
// Grant refusals and policy refusals share 42501; only a grant says this.
const DENIED_BY_GRANT = "42501: permission denied for table edges";

describe("edges select policy", () => {
  it("shows a member the edges of their own project and no others", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await visibleEdges(sql)).toEqual([MY_EDGE]);
      });
    });
  });

  it("shows a non-member nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleEdges(sql)).toEqual([]);
      });
    });
  });
});

describe("edges insert policy", () => {
  it("lets a member draw an edge in their own project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        const { rowCount } = await sql.query(
          `insert into public.edges (project_id, source_id, target_id, type, created_by)
           values ($1, $2, $3, 'firm_block', $4)`,
          [MINE, MY_TARGET, MY_SOURCE, MEMBER],
        );
        expect(rowCount).toBe(1);
      });
    });
  });

  // The nodes named here belong to the other project, so 0009's composite
  // foreign keys are satisfied and the policy is the only thing left refusing.
  it("refuses an edge in a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(
            sql,
            `insert into public.edges (project_id, source_id, target_id, type, created_by)
             values ($1, $2, $3, 'subtask', $4)`,
            [THEIRS, THEIR_SOURCE, THEIR_TARGET, MEMBER],
          ),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });
});

describe("edges update policy", () => {
  it("lets a member remove an edge in their own project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await remove(sql, MY_EDGE)).toBe(1);
      });
    });
  });

  it("does not reach an edge in a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await remove(sql, THEIR_EDGE)).toBe(0);
      });
    });
  });

  // The update grant covers removed_at alone, so a member never gets far enough
  // for the policy's WITH CHECK to be what stops them moving an edge; that
  // clause is the layer underneath if the grant ever widens.
  it("refuses moving an edge into another project, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, `update public.edges set project_id = $1 where id = $2`, [
            THEIRS,
            MY_EDGE,
          ]),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });

  it("refuses rewriting an edge's endpoints, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, `update public.edges set target_id = $1 where id = $2`, [
            MY_SOURCE,
            MY_EDGE,
          ]),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });
});

describe("edges delete", () => {
  it("refuses a member deleting their own edge, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await refusal(sql, `delete from public.edges where id = $1`, [MY_EDGE])).toBe(
          DENIED_BY_GRANT,
        );
      });
    });
  });
});
