import { readdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

type SuiteException = {
  table: string;
  reason: string;
};

// Tables intentionally left without a suite. Every entry needs a reason.
const suiteExceptions: SuiteException[] = [];

// A table's suites are named after it with `_` swapped for `-`, plus any suffix:
// project_members -> project-members.test.ts or project-members-<anything>.test.ts.
function hasSuite(table: string, files: string[]): boolean {
  const slug = table.replaceAll("_", "-");
  return files.some((file) => file === `${slug}.test.ts` || file.startsWith(`${slug}-`));
}

function tablesWithoutSuite(tables: string[], files: string[]): string[] {
  return tables.filter(
    (table) =>
      !hasSuite(table, files) && !suiteExceptions.some((exception) => exception.table === table),
  );
}

const suiteFiles = readdirSync(import.meta.dirname).filter((file) => file.endsWith(".test.ts"));

let tables: string[] = [];

describe("per-table suite coverage", () => {
  beforeAll(async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ table: string }>(
        `select class.relname::text as table
           from pg_class class
           join pg_namespace namespace on namespace.oid = class.relnamespace
          where namespace.nspname = 'public'
            and class.relkind = 'r'
          order by 1`,
      );
      tables = rows.map((row) => row.table);
    });
  });

  it("enumerates the public schema from the catalog", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it("gives every exception a reason", () => {
    expect(suiteExceptions.filter((exception) => exception.reason.trim() === "")).toEqual([]);
  });

  it("has a suite for every public table", () => {
    expect(tablesWithoutSuite(tables, suiteFiles)).toEqual([]);
  });

  // The three below prove the check bites. A meta check that only ever passes
  // on the current tree guards nothing.
  it("catches a new table nobody wrote a suite for", () => {
    expect(tablesWithoutSuite([...tables, "widgets"], suiteFiles)).toEqual(["widgets"]);
  });

  it("catches a table whose suites were deleted", () => {
    const withoutNodes = suiteFiles.filter((file) => !file.startsWith("nodes"));
    expect(tablesWithoutSuite(["nodes"], withoutNodes)).toEqual(["nodes"]);
  });

  it("does not let events.test.ts stand in for an event table", () => {
    expect(tablesWithoutSuite(["event"], suiteFiles)).toEqual(["event"]);
  });
});
