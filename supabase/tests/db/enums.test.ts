import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

async function enumLabels(sql: Client, typeName: string): Promise<string[] | undefined> {
  const { rows } = await sql.query<{ labels: string[] }>(
    `select array_agg(enumlabel::text order by enumsortorder) as labels
       from pg_enum where enumtypid = $1::regtype`,
    [typeName],
  );
  return rows[0]?.labels;
}

describe("workflow enums", () => {
  it("node_status labels, in order", async () => {
    await withRollback(async (sql) => {
      expect(await enumLabels(sql, "public.node_status")).toEqual([
        "human_braindump_needed",
        "awaiting_agent_breakdown",
        "awaiting_human_response",
        "split_proposed",
        "split_approved",
        "broken_down",
        "awaiting_agent_spec",
        "spec_review",
        "ready_for_pickup",
        "human_only_action",
        "pr_raised",
        "pr_changes_requested",
        "pr_base_moved",
        "done",
        "invalidated",
      ]);
    });
  });

  it("edge_type labels, in order", async () => {
    await withRollback(async (sql) => {
      expect(await enumLabels(sql, "public.edge_type")).toEqual([
        "subtask",
        "firm_block",
        "firm_block_plan",
        "relates_to",
      ]);
    });
  });

  it("message_type labels, in order", async () => {
    await withRollback(async (sql) => {
      expect(await enumLabels(sql, "public.message_type")).toEqual([
        "note",
        "question",
        "answer",
        "split_proposal",
        "split_decision",
        "spec_submission",
        "review_comment",
        "system",
      ]);
    });
  });
});

describe("extensions", () => {
  it("installs pgcrypto in schema extensions", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ nspname: string }>(
        `select namespace.nspname::text as nspname
           from pg_extension extension
           join pg_namespace namespace on namespace.oid = extension.extnamespace
          where extension.extname = 'pgcrypto'`,
      );
      expect(rows[0]?.nspname).toBe("extensions");
    });
  });
});
