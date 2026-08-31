import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceRoleClient, signedInClient, withRollback, withSql } from "./harness.ts";
import { seedRowPerTable } from "./seed.ts";

type Tier = "anon" | "authenticated";

type AccessException = {
  relation: string;
  column: string;
  tier: Tier;
  reason: string;
};

// Columns intentionally readable through PostgREST. Every entry needs a reason.
const accessExceptions: AccessException[] = [];

const denialCodes = new Set([
  "42501", // permission denied for table/column
  "PGRST106", // schema not exposed
  "PGRST205", // relation absent from the schema cache
]);

// anon holds no grants at all, so anything but a refusal is a leak. A signed-in
// user does hold grants once a table's policies land, which turns a
// non-member's read from a 42501 into an empty 200 -- so that tier accepts
// either. The seeded fixture is what stops "empty" also meaning "empty table".
const acceptedOutcomes: Record<Tier, string[]> = {
  anon: ["denied"],
  authenticated: ["denied", "empty"],
};

type Column = { relation: string; column: string };

let columns: Column[] = [];
let authenticated: SupabaseClient;
let userId: string;

async function publicColumns(): Promise<Column[]> {
  let found: Column[] = [];
  await withRollback(async (sql) => {
    const { rows } = await sql.query<Column>(
      `select class.relname::text as relation, attribute.attname::text as column
         from pg_class class
         join pg_namespace namespace on namespace.oid = class.relnamespace
         join pg_attribute attribute on attribute.attrelid = class.oid
        where namespace.nspname = 'public'
          and class.relkind = 'r'
          and attribute.attnum > 0
          and not attribute.attisdropped
        order by 1, 2`,
    );
    found = rows;
  });
  return found;
}

async function emptyRelations(): Promise<string[]> {
  const relations = [...new Set(columns.map((column) => column.relation))];
  const empty: string[] = [];
  await withSql(async (sql) => {
    for (const relation of relations) {
      const { rows } = await sql.query(`select 1 from public."${relation}" limit 1`);
      if (rows.length === 0) empty.push(relation);
    }
  });
  return empty;
}

async function readOutcome(client: SupabaseClient, { relation, column }: Column): Promise<string> {
  const { data, error } = await client.from(relation).select(column).limit(1);
  if (error) {
    return denialCodes.has(error.code) ? "denied" : `unexpected ${error.code}: ${error.message}`;
  }
  return data.length === 0 ? "empty" : "readable";
}

function isAllowed(column: Column, tier: Tier): boolean {
  return accessExceptions.some(
    (exception) =>
      exception.relation === column.relation &&
      exception.column === column.column &&
      exception.tier === tier,
  );
}

async function leakedColumns(client: SupabaseClient, tier: Tier): Promise<string[]> {
  const outcomes = await Promise.all(
    columns.map(async (column) => ({ column, outcome: await readOutcome(client, column) })),
  );
  return outcomes
    .filter(
      ({ column, outcome }) =>
        !acceptedOutcomes[tier].includes(outcome) &&
        !(outcome === "readable" && isAllowed(column, tier)),
    )
    .map(({ column, outcome }) => `${column.relation}.${column.column}: ${outcome}`);
}

const admin = serviceRoleClient();
const credentials = {
  email: `access-coverage-${Date.now()}@example.com`,
  password: "Str0ng-Passw0rd!23",
};

describe("column access coverage", () => {
  beforeAll(async () => {
    columns = await publicColumns();
    await withSql(seedRowPerTable);
    const { data, error } = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    authenticated = await signedInClient(credentials);
  }, 30_000);

  afterAll(async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  it("enumerates the public schema from the catalog", () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  it("gives every exception a reason", () => {
    expect(accessExceptions.filter((exception) => exception.reason.trim() === "")).toEqual([]);
  });

  it("has a row to hide in every public table", async () => {
    expect(await emptyRelations()).toEqual([]);
  });

  it("denies anon every column", async () => {
    expect(await leakedColumns(anonClient(), "anon")).toEqual([]);
  }, 30_000);

  it("shows a signed-in non-member no rows in any column", async () => {
    expect(await leakedColumns(authenticated, "authenticated")).toEqual([]);
  }, 30_000);
});
