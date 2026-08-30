import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

type PlanNode = {
  "Index Name"?: string;
  "Index Cond"?: string;
  Plans?: PlanNode[];
};

function conditionedIndexes(plan: PlanNode): string[] {
  const here = plan["Index Cond"] && plan["Index Name"] ? [plan["Index Name"]] : [];
  return [...here, ...(plan.Plans ?? []).flatMap(conditionedIndexes)];
}

async function indexesUsedBy(sql: Client, query: string): Promise<string[]> {
  // Without this the planner picks a seq scan on the empty test tables. Off, it
  // has to reach for an index, so a match proves the index is usable for this
  // query shape — column order, casts and collation included — not preferred.
  await sql.query("set local enable_seqscan = off");
  const { rows } = await sql.query<{ "QUERY PLAN": { Plan: PlanNode }[] }>(
    `explain (format json) ${query}`,
  );
  return (rows[0]?.["QUERY PLAN"] ?? []).flatMap((entry) => conditionedIndexes(entry.Plan)).sort();
}

describe("events index plans", () => {
  it("the project timeline query goes through events_project_id_created_at_idx", async () => {
    await withRollback(async (sql) => {
      expect(
        await indexesUsedBy(
          sql,
          `select id from public.events
            where project_id = '00000000-0000-0000-0000-0000000000b1'
            order by created_at desc`,
        ),
      ).toEqual(["events_project_id_created_at_idx"]);
    });
  });

  it("the per-node history query goes through events_node_id_idx", async () => {
    await withRollback(async (sql) => {
      expect(
        await indexesUsedBy(
          sql,
          `select id from public.events
            where node_id = '00000000-0000-0000-0000-0000000000c1'`,
        ),
      ).toEqual(["events_node_id_idx"]);
    });
  });
});

describe("nodes index plans", () => {
  it("the board query goes through nodes_project_id_status_idx", async () => {
    await withRollback(async (sql) => {
      expect(
        await indexesUsedBy(
          sql,
          `select id from public.nodes
            where project_id = '00000000-0000-0000-0000-0000000000b1'
              and status = 'ready_for_pickup'`,
        ),
      ).toEqual(["nodes_project_id_status_idx"]);
    });
  });

  it("the search query goes through nodes_fts_idx", async () => {
    await withRollback(async (sql) => {
      expect(
        await indexesUsedBy(
          sql,
          `select id from public.nodes
            where fts @@ to_tsquery('english', 'alpha')`,
        ),
      ).toEqual(["nodes_fts_idx"]);
    });
  });
});
