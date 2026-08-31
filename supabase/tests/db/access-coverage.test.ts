import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceRoleClient, signedInClient, withRollback, withSql } from "./harness.ts";
import { clearProjectGraph, foreignGraph, seedProjectGraph } from "./seed.ts";

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

// anon holds no grant at all, so every column must be refused outright. A
// signed-in user holds grants but no membership, so RLS answers an empty 200
// instead -- which only proves anything because the fixture below puts a row in
// every table, and "no rows in a populated table" is the whole assertion.
const permittedOutcomes: Record<Tier, Set<string>> = {
  anon: new Set(["denied"]),
  authenticated: new Set(["denied", "empty"]),
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

async function reachableColumns(client: SupabaseClient, tier: Tier): Promise<string[]> {
  const outcomes = await Promise.all(
    columns.map(async (column) => ({ column, outcome: await readOutcome(client, column) })),
  );
  return outcomes
    .filter(
      ({ column, outcome }) =>
        !permittedOutcomes[tier].has(outcome) &&
        !(outcome === "readable" && isAllowed(column, tier)),
    )
    .map(({ column, outcome }) => `${column.relation}.${column.column}: ${outcome}`);
}

async function emptyRelations(): Promise<string[]> {
  const relations = [...new Set(columns.map((column) => column.relation))];
  const counted = await Promise.all(
    relations.map(async (relation) => ({
      relation,
      count: (await admin.from(relation).select("*", { count: "exact", head: true })).count,
    })),
  );
  return counted.filter(({ count }) => count === 0).map(({ relation }) => relation);
}

const admin = serviceRoleClient();
const credentials = {
  email: `access-coverage-${Date.now()}@example.com`,
  password: "Str0ng-Passw0rd!23",
};

describe("column access coverage", () => {
  beforeAll(async () => {
    columns = await publicColumns();
    await withSql(async (sql) => {
      await clearProjectGraph(sql, foreignGraph);
      await seedProjectGraph(sql, foreignGraph);
    });
    const { data, error } = await admin.auth.admin.createUser({
      ...credentials,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    authenticated = await signedInClient(credentials);
  }, 30_000);

  afterAll(async () => {
    await withSql((sql) => clearProjectGraph(sql, foreignGraph));
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  it("enumerates the public schema from the catalog", () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  it("gives every exception a reason", () => {
    expect(accessExceptions.filter((exception) => exception.reason.trim() === "")).toEqual([]);
  });

  it("holds a row in every table, so an empty read is RLS and not an empty table", async () => {
    expect(await emptyRelations()).toEqual([]);
  }, 30_000);

  it("denies anon every column", async () => {
    expect(await reachableColumns(anonClient(), "anon")).toEqual([]);
  }, 30_000);

  it("shows a signed-in non-member no row of any column", async () => {
    expect(await reachableColumns(authenticated, "authenticated")).toEqual([]);
  }, 30_000);
});
