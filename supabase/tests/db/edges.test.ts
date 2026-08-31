import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";
import { seedNodes, seedProject, seedUsers } from "./seed.ts";

const USER_ID = "00000000-0000-0000-0000-0000000000e1";
const PROJECT_ID = "00000000-0000-0000-0000-0000000000e2";
const SOURCE_ID = "00000000-0000-0000-0000-0000000000e3";
const TARGET_ID = "00000000-0000-0000-0000-0000000000e4";
const MISSING_ID = "00000000-0000-0000-0000-0000000000ef";

type EdgeInsert = {
  projectId?: string;
  sourceId?: string;
  targetId?: string;
  type?: string;
  createdBy?: string;
};

type EdgeRow = { id: string; removed_at: Date | null; created_at: Date };

async function seedGraph(sql: Client): Promise<void> {
  await seedUsers(sql, [USER_ID]);
  await seedProject(sql, PROJECT_ID, USER_ID);
  await seedNodes(sql, [SOURCE_ID, TARGET_ID], PROJECT_ID, USER_ID);
}

const VALID_EDGE: Required<EdgeInsert> = {
  projectId: PROJECT_ID,
  sourceId: SOURCE_ID,
  targetId: TARGET_ID,
  type: "subtask",
  createdBy: USER_ID,
};

function insertEdge(sql: Client, edge: EdgeInsert = {}): Promise<QueryResult<EdgeRow>> {
  const { projectId, sourceId, targetId, type, createdBy } = { ...VALID_EDGE, ...edge };
  return sql.query<EdgeRow>(
    `insert into public.edges (project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, $4, $5)
     returning id, removed_at, created_at`,
    [projectId, sourceId, targetId, type, createdBy],
  );
}

describe("edges constraints", () => {
  it.each<[string, EdgeInsert, string]>([
    ["an edge from a node to itself", { targetId: SOURCE_ID }, "23514"],
    ["a source_id that is not a real node", { sourceId: MISSING_ID }, "23503"],
    ["a target_id that is not a real node", { targetId: MISSING_ID }, "23503"],
    ["a project_id that is not a real project", { projectId: MISSING_ID }, "23503"],
    ["a created_by that is not a real auth.users row", { createdBy: MISSING_ID }, "23503"],
    ["a type outside edge_type, which is the enum and not text", { type: "soft_block" }, "22P02"],
  ])("rejects %s", async (_case, edge, sqlstate) => {
    await withRollback(async (sql) => {
      await seedGraph(sql);
      await expect(insertEdge(sql, edge)).rejects.toMatchObject({ code: sqlstate });
    });
  });

  it("accepts a repeated edge and the reverse of an existing one", async () => {
    await withRollback(async (sql) => {
      await seedGraph(sql);
      await insertEdge(sql);
      const repeated = await insertEdge(sql);
      const reversed = await insertEdge(sql, { sourceId: TARGET_ID, targetId: SOURCE_ID });

      expect(repeated.rowCount).toBe(1);
      expect(reversed.rowCount).toBe(1);
    });
  });

  it("refuses to delete a node an edge still points at", async () => {
    await withRollback(async (sql) => {
      await seedGraph(sql);
      await insertEdge(sql);

      await expect(
        sql.query(`delete from public.nodes where id = $1`, [TARGET_ID]),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });
});

describe("edges defaults", () => {
  it("starts an edge present, with a server-set id and created_at", async () => {
    await withRollback(async (sql) => {
      await seedGraph(sql);
      const row = (await insertEdge(sql)).rows[0];

      expect(row?.removed_at).toBeNull();
      expect(row?.created_at).toBeInstanceOf(Date);
      expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});

describe("edges schema", () => {
  it("indexes each of the three columns the graph is walked by", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ indexdef: string }>(
        `select indexdef from pg_indexes
          where schemaname = 'public' and tablename = 'edges'
          order by indexname`,
      );

      expect(rows.map((row) => row.indexdef)).toEqual([
        "CREATE UNIQUE INDEX edges_pkey ON public.edges USING btree (id)",
        "CREATE INDEX edges_project_id_idx ON public.edges USING btree (project_id)",
        "CREATE INDEX edges_source_id_idx ON public.edges USING btree (source_id)",
        "CREATE INDEX edges_target_id_idx ON public.edges USING btree (target_id)",
      ]);
    });
  });

  it("has row level security on and no policies yet: those land in slice 8c320d4b", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ enabled: boolean; policies: number }>(
        `select relrowsecurity as enabled,
                (select count(*)::int from pg_policies
                  where schemaname = 'public' and tablename = 'edges') as policies
           from pg_class where oid = 'public.edges'::regclass`,
      );

      expect(rows[0]).toEqual({ enabled: true, policies: 0 });
    });
  });
});
