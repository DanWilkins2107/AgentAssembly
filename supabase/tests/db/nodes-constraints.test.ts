import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const PROJECT_ID = "00000000-0000-0000-0000-0000000000b1";

const minimalNode = {
  project_id: PROJECT_ID,
  title: "Node",
  status: "human_braindump_needed",
  created_by: USER_ID,
};

function insertNode(sql: Client, columns: Record<string, unknown>): Promise<QueryResult> {
  const names = Object.keys(columns);
  const placeholders = names.map((_, index) => `$${index + 1}`);
  return sql.query(
    `insert into public.nodes (${names.join(", ")}) values (${placeholders.join(", ")})`,
    Object.values(columns),
  );
}

function withProject(run: (sql: Client) => Promise<void>): Promise<void> {
  return withRollback(async (sql) => {
    await sql.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'nodes-constraints-test@example.com', '', now(), now())`,
      [USER_ID],
    );
    await sql.query(`insert into public.projects (id, name, created_by) values ($1, $2, $3)`, [
      PROJECT_ID,
      "Nodes test",
      USER_ID,
    ]);
    await run(sql);
  });
}

describe("nodes CHECK constraints", () => {
  it.each([
    ["an empty title", { title: "" }],
    ["a title longer than 300 characters", { title: "x".repeat(301) }],
    ["a body longer than 20000 characters", { body: "x".repeat(20001) }],
    ["a spec longer than 20000 characters", { spec: "x".repeat(20001) }],
    ["an invalidation_reason over 5000 characters", { invalidation_reason: "x".repeat(5001) }],
    ["a pr_number of zero, since PR numbers start at one", { pr_number: 0 }],
    ["a claimed_by over 200 characters", { claimed_by: "x".repeat(201), claimed_at: new Date() }],
    ["a claimed_by without a claimed_at", { claimed_by: "Dans_Laptop:1" }],
    ["a claimed_at without a claimed_by", { claimed_at: new Date() }],
  ])("rejects %s", async (_case, overrides) =>
    withProject(async (sql) => {
      await expect(insertNode(sql, { ...minimalNode, ...overrides })).rejects.toMatchObject({
        code: "23514",
      });
    }),
  );

  it("accepts a claim with both halves", async () =>
    withProject(async (sql) => {
      const result = await insertNode(sql, {
        ...minimalNode,
        claimed_by: "Dans_Laptop:1",
        claimed_at: new Date(),
      });
      expect(result.rowCount).toBe(1);
    }));

  it("accepts a node linked to a PR by number", async () =>
    withProject(async (sql) => {
      const result = await insertNode(sql, { ...minimalNode, status: "pr_raised", pr_number: 7 });
      expect(result.rowCount).toBe(1);
    }));
});

describe("nodes status", () => {
  it("rejects an omitted status: there is no default to fall back on", async () =>
    withProject(async (sql) => {
      const { status: _status, ...withoutStatus } = minimalNode;
      await expect(insertNode(sql, withoutStatus)).rejects.toMatchObject({ code: "23502" });
    }));

  it("rejects a status outside node_status: soft blocking is retired, not storable", async () =>
    withProject(async (sql) => {
      await expect(
        insertNode(sql, { ...minimalNode, status: "evaluating_soft_block" }),
      ).rejects.toMatchObject({ code: "22P02" });
    }));
});

describe("nodes foreign keys", () => {
  it("rejects a project_id that references no project", async () =>
    withProject(async (sql) => {
      await expect(
        insertNode(sql, { ...minimalNode, project_id: "00000000-0000-0000-0000-0000000000bf" }),
      ).rejects.toMatchObject({ code: "23503" });
    }));

  it("rejects a created_by that references no auth.users row", async () =>
    withProject(async (sql) => {
      await expect(
        insertNode(sql, { ...minimalNode, created_by: "00000000-0000-0000-0000-0000000000af" }),
      ).rejects.toMatchObject({ code: "23503" });
    }));

  it("refuses deleting a project that still has nodes: nothing cascades", async () =>
    withProject(async (sql) => {
      await insertNode(sql, minimalNode);
      await expect(
        sql.query(`delete from public.projects where id = $1`, [PROJECT_ID]),
      ).rejects.toMatchObject({ code: "23503" });
    }));
});
