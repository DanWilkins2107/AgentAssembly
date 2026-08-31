import { describe, expect, it } from "vitest";
import { indexesUsedBy } from "./explain.ts";
import { withRollback } from "./harness.ts";

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
