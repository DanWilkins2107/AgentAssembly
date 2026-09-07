import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";
import { seedNodes, seedProject, seedUsers } from "./seed.ts";

const USER = "00000000-0000-0000-0000-0000000000f1";
const PROJECT = "00000000-0000-0000-0000-0000000000f2";
const OTHER_PROJECT = "00000000-0000-0000-0000-0000000000f3";
const NODE_A = "00000000-0000-0000-0000-0000000000f4";
const NODE_B = "00000000-0000-0000-0000-0000000000f5";
const OTHER_NODE = "00000000-0000-0000-0000-0000000000f6";

const FORBIDDEN = "23001";
const FOREIGN_KEY_VIOLATION = "23503";

const historyTables = ["projects", "nodes", "edges", "messages", "events"];

async function seedBoard(sql: Client): Promise<void> {
  await seedUsers(sql, [USER]);
  await seedProject(sql, PROJECT, USER);
  await seedProject(sql, OTHER_PROJECT, USER);
  await seedNodes(sql, [NODE_A, NODE_B], PROJECT, USER);
  await seedNodes(sql, [OTHER_NODE], OTHER_PROJECT, USER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'owner')`,
    [PROJECT, USER],
  );
  await sql.query(
    `insert into public.edges (project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, 'subtask', $4)`,
    [PROJECT, NODE_A, NODE_B, USER],
  );
  await sql.query(
    `insert into public.messages (node_id, project_id, stage, type, author_role, body)
     values ($1, $2, 'ready_for_pickup', 'note', 'agent', 'Seeded')`,
    [NODE_A, PROJECT],
  );
  await sql.query(
    `insert into public.events (project_id, node_id, actor_role, type)
     values ($1, $2, 'agent', 'seeded')`,
    [PROJECT, NODE_A],
  );
}

function insertEdge(sql: Client, projectId: string): Promise<QueryResult> {
  return sql.query(
    `insert into public.edges (project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, 'relates_to', $4)`,
    [projectId, NODE_A, NODE_B, USER],
  );
}

function insertMessage(sql: Client, projectId: string): Promise<QueryResult> {
  return sql.query(
    `insert into public.messages (node_id, project_id, stage, type, author_role, body)
     values ($1, $2, 'ready_for_pickup', 'note', 'agent', 'Cross project')`,
    [NODE_A, projectId],
  );
}

describe("history is undeletable", () => {
  it.each(historyTables)("refuses DELETE on %s", async (table) => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(sql.query(`delete from public.${table}`)).rejects.toMatchObject({
        code: FORBIDDEN,
      });
    });
  });

  it.each(historyTables)("refuses TRUNCATE on %s", async (table) => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(sql.query(`truncate public.${table} cascade`)).rejects.toMatchObject({
        code: FORBIDDEN,
      });
    });
  });

  it("still lets a membership be revoked", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      const revoked = await sql.query(
        `delete from public.project_members where project_id = $1 and user_id = $2`,
        [PROJECT, USER],
      );

      expect(revoked.rowCount).toBe(1);
    });
  });
});

describe("write-once rows", () => {
  it("refuses UPDATE on messages", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(
        sql.query(`update public.messages set body = 'Edited' where project_id = $1`, [PROJECT]),
      ).rejects.toMatchObject({ code: FORBIDDEN });
    });
  });

  it("refuses UPDATE on events", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(
        sql.query(`update public.events set type = 'edited' where project_id = $1`, [PROJECT]),
      ).rejects.toMatchObject({ code: FORBIDDEN });
    });
  });
});

describe("edges are write-once apart from removal", () => {
  it("accepts removing an edge once", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      const removed = await sql.query(
        `update public.edges set removed_at = now() where project_id = $1`,
        [PROJECT],
      );

      expect(removed.rowCount).toBe(1);
    });
  });

  it.each<[string, string]>([
    ["removing an already removed edge", `removed_at = now()`],
    ["restoring a removed edge", `removed_at = null`],
  ])("refuses %s", async (_case, assignment) => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await sql.query(`update public.edges set removed_at = now() where project_id = $1`, [
        PROJECT,
      ]);

      await expect(
        sql.query(`update public.edges set ${assignment} where project_id = $1`, [PROJECT]),
      ).rejects.toMatchObject({ code: FORBIDDEN });
    });
  });

  it.each<[string, string]>([
    ["changing another column", `type = 'relates_to'`],
    ["changing another column alongside removal", `type = 'relates_to', removed_at = now()`],
  ])("refuses %s", async (_case, assignment) => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(
        sql.query(`update public.edges set ${assignment} where project_id = $1`, [PROJECT]),
      ).rejects.toMatchObject({ code: FORBIDDEN });
    });
  });
});

describe("cross-project references", () => {
  it("accepts an edge and a message whose project matches the node", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);

      expect((await insertEdge(sql, PROJECT)).rowCount).toBe(1);
      expect((await insertMessage(sql, PROJECT)).rowCount).toBe(1);
    });
  });

  it("refuses an edge whose project_id is not the nodes' project", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(insertEdge(sql, OTHER_PROJECT)).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
      });
    });
  });

  it("refuses a message whose project_id is not the node's project", async () => {
    await withRollback(async (sql) => {
      await seedBoard(sql);
      await expect(insertMessage(sql, OTHER_PROJECT)).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
      });
    });
  });
});
