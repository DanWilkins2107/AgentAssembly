import type { Client } from "pg";

type PlanNode = {
  "Index Name"?: string;
  "Index Cond"?: string;
  Plans?: PlanNode[];
};

function conditionedIndexes(plan: PlanNode): string[] {
  const here = plan["Index Cond"] && plan["Index Name"] ? [plan["Index Name"]] : [];
  return [...here, ...(plan.Plans ?? []).flatMap(conditionedIndexes)];
}

export async function indexesUsedBy(sql: Client, query: string): Promise<string[]> {
  // Without this the planner picks a seq scan on the empty test tables. Off, it
  // has to reach for an index, so a match proves the index is usable for this
  // query shape — column order, casts and collation included — not preferred.
  await sql.query("set local enable_seqscan = off");
  const { rows } = await sql.query<{ "QUERY PLAN": { Plan: PlanNode }[] }>(
    `explain (format json) ${query}`,
  );
  return (rows[0]?.["QUERY PLAN"] ?? []).flatMap((entry) => conditionedIndexes(entry.Plan)).sort();
}
