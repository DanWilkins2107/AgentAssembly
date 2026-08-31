import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";
import { seedProject, seedUsers } from "./seed.ts";

const OWNER_USER = "00000000-0000-0000-0000-0000000000c1";
const AGENT_USER = "00000000-0000-0000-0000-0000000000c2";
const PROJECT = "00000000-0000-0000-0000-0000000000d1";
const ABSENT = "00000000-0000-0000-0000-0000000000ff";

async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [OWNER_USER, AGENT_USER]);
  await seedProject(sql, PROJECT, OWNER_USER);
}

function addMember(
  sql: Client,
  member: { project?: string; user: string; role: string | null },
): Promise<QueryResult> {
  return sql.query(
    `insert into public.project_members (project_id, user_id, role) values ($1, $2, $3)`,
    [member.project ?? PROJECT, member.user, member.role],
  );
}

describe("project_members role", () => {
  it("accepts owner", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(addMember(sql, { user: OWNER_USER, role: "owner" })).resolves.toMatchObject({
        rowCount: 1,
      });
    });
  });

  it("accepts agent", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(addMember(sql, { user: AGENT_USER, role: "agent" })).resolves.toMatchObject({
        rowCount: 1,
      });
    });
  });

  it("rejects a role outside the closed set on insert", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(addMember(sql, { user: OWNER_USER, role: "admin" })).rejects.toMatchObject({
        code: "23514",
      });
    });
  });

  it("rejects a role outside the closed set on update", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await addMember(sql, { user: OWNER_USER, role: "owner" });
      await expect(
        sql.query(`update public.project_members set role = 'admin' where user_id = $1`, [
          OWNER_USER,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects a null role", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(addMember(sql, { user: OWNER_USER, role: null })).rejects.toMatchObject({
        code: "23502",
      });
    });
  });
});

describe("project_members membership", () => {
  it("rejects a second role for the same user on the same project", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await addMember(sql, { user: OWNER_USER, role: "owner" });
      await expect(addMember(sql, { user: OWNER_USER, role: "agent" })).rejects.toMatchObject({
        code: "23505",
      });
    });
  });

  it("rejects a project_id with no projects row", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(
        addMember(sql, { project: ABSENT, user: OWNER_USER, role: "owner" }),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("rejects a user_id with no auth.users row", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await expect(addMember(sql, { user: ABSENT, role: "owner" })).rejects.toMatchObject({
        code: "23503",
      });
    });
  });

  it("blocks deleting a project that still has members", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await addMember(sql, { user: OWNER_USER, role: "owner" });
      await expect(
        sql.query(`delete from public.projects where id = $1`, [PROJECT]),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("blocks deleting a user who is still a member", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await addMember(sql, { user: AGENT_USER, role: "agent" });
      await expect(
        sql.query(`delete from auth.users where id = $1`, [AGENT_USER]),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });
});
