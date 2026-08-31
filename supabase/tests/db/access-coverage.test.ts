import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceRoleClient, signedInClient, withRollback } from "./harness.ts";

type Tier = "anon" | "authenticated";

type AccessException = {
  relation: string;
  column: string;
  tier: Tier;
  reason: string;
};

// Columns intentionally readable through PostgREST. Every entry needs a reason.
const accessExceptions: AccessException[] = [];

// A read is only safe when the API refuses it outright. An empty 200 means the
// grant exists and only RLS is holding the door, and it is indistinguishable
// from an empty table -- so it counts as readable, not denied.
const denialCodes = new Set([
  "42501", // permission denied for table/column
  "PGRST106", // schema not exposed
  "PGRST205", // relation absent from the schema cache
]);

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
  const { error } = await client.from(relation).select(column).limit(1);
  if (!error) return "readable";
  if (denialCodes.has(error.code)) return "denied";
  return `unexpected ${error.code}: ${error.message}`;
}

function isAllowed(column: Column, tier: Tier): boolean {
  return accessExceptions.some(
    (exception) =>
      exception.relation === column.relation &&
      exception.column === column.column &&
      exception.tier === tier,
  );
}

async function undeniedColumns(client: SupabaseClient, tier: Tier): Promise<string[]> {
  const outcomes = await Promise.all(
    columns.map(async (column) => ({ column, outcome: await readOutcome(client, column) })),
  );
  return outcomes
    .filter(
      ({ column, outcome }) =>
        outcome !== "denied" && !(outcome === "readable" && isAllowed(column, tier)),
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

  it("denies anon every column", async () => {
    expect(await undeniedColumns(anonClient(), "anon")).toEqual([]);
  }, 30_000);

  it("denies a signed-in user every column", async () => {
    expect(await undeniedColumns(authenticated, "authenticated")).toEqual([]);
  }, 30_000);
});
