import type { Client, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

const PROJECT_ID = "00000000-0000-0000-0000-0000000000b1";

type EventRow = { id: string; data: Record<string, unknown> };

function insertEvent(
  sql: Client,
  event: { actorRole: string; type: string },
): Promise<QueryResult<EventRow>> {
  return sql.query<EventRow>(
    `insert into public.events (project_id, actor_role, type)
     values ($1, $2, $3)
     returning id, data`,
    [PROJECT_ID, event.actorRole, event.type],
  );
}

describe("events constraints", () => {
  it.each([
    ["an actor_role outside (human, agent, system)", { actorRole: "robot", type: "check_test" }],
    ["a type longer than 100 characters", { actorRole: "system", type: "x".repeat(101) }],
  ])("rejects %s", async (_case, event) => {
    await withRollback(async (sql) => {
      await expect(insertEvent(sql, event)).rejects.toMatchObject({ code: "23514" });
    });
  });
});

describe("events defaults", () => {
  it("gives a minimal insert an empty data object and a positive identity id", async () => {
    await withRollback(async (sql) => {
      const row = (await insertEvent(sql, { actorRole: "system", type: "minimal_insert_test" }))
        .rows[0];

      expect(row?.data).toEqual({});
      expect(Number(row?.id)).toBeGreaterThan(0);
    });
  });
});
