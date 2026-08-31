import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";
import { seedUsers } from "./seed.ts";

const USER_ID = "00000000-0000-0000-0000-0000000000aa";

type ProjectInsert = {
  name: string;
  repoOwner?: string | null;
  repoName?: string | null;
  createdBy?: string;
};

type ProjectRow = {
  webhook_secret: string;
  repo_owner: string | null;
  repo_name: string | null;
  archived_at: Date | null;
};

function insertProject(sql: Client, project: ProjectInsert): Promise<QueryResult<ProjectRow>> {
  return sql.query<ProjectRow>(
    `insert into public.projects (name, repo_owner, repo_name, created_by)
     values ($1, $2, $3, $4)
     returning webhook_secret, repo_owner, repo_name, archived_at`,
    [
      project.name,
      project.repoOwner ?? null,
      project.repoName ?? null,
      project.createdBy ?? USER_ID,
    ],
  );
}

const REPO_PAIR = { repoOwner: "DanWilkins2107", repoName: "AgentAssembly" };

describe("projects constraints", () => {
  it.each<[string, ProjectInsert, string]>([
    ["an empty name", { name: "" }, "23514"],
    ["a name longer than 200 characters", { name: "x".repeat(201) }, "23514"],
    [
      "a repo_owner longer than 200 characters",
      { ...REPO_PAIR, name: "Long owner", repoOwner: "x".repeat(201) },
      "23514",
    ],
    [
      "a repo_name longer than 200 characters",
      { ...REPO_PAIR, name: "Long name", repoName: "x".repeat(201) },
      "23514",
    ],
    [
      "a repo_owner without a repo_name",
      { name: "Half link", repoOwner: "DanWilkins2107" },
      "23514",
    ],
    [
      "a repo_name without a repo_owner",
      { name: "Half link", repoName: "AgentAssembly" },
      "23514",
    ],
    [
      "a created_by that is not a real auth.users row",
      { name: "Orphan", createdBy: "00000000-0000-0000-0000-0000000000ff" },
      "23503",
    ],
  ])("rejects %s", async (_case, project, sqlstate) => {
    await withRollback(async (sql) => {
      await seedUsers(sql, [USER_ID]);
      await expect(insertProject(sql, project)).rejects.toMatchObject({ code: sqlstate });
    });
  });

  it("accepts a full repo pair, and a second project tracking the same repo", async () => {
    await withRollback(async (sql) => {
      await seedUsers(sql, [USER_ID]);
      await insertProject(sql, { ...REPO_PAIR, name: "Both halves" });
      const second = await insertProject(sql, { ...REPO_PAIR, name: "Same repo again" });
      expect(second.rowCount).toBe(1);
    });
  });
});

describe("projects defaults", () => {
  it("starts each project unlinked, unarchived, with its own 64 hex character secret", async () => {
    await withRollback(async (sql) => {
      await seedUsers(sql, [USER_ID]);
      const first = (await insertProject(sql, { name: "Projects test" })).rows[0];
      const second = (await insertProject(sql, { name: "Projects test two" })).rows[0];

      expect(first).toMatchObject({ repo_owner: null, repo_name: null, archived_at: null });
      expect(first?.webhook_secret).toMatch(/^[0-9a-f]{64}$/);
      expect(second?.webhook_secret).not.toBe(first?.webhook_secret);
    });
  });
});
