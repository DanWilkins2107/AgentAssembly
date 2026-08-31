import { describe, expect, it } from "vitest";
import { indexesUsedBy } from "./explain.ts";
import { withRollback } from "./harness.ts";

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
