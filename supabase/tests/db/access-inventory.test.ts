import { beforeAll, describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

type Grant = { relation: string; grantee: string; privilege: string };
type Policy = {
  relation: string;
  name: string;
  command: string;
  roles: string;
  permissive: string;
  qual: string | null;
  withCheck: string | null;
};

type TableAccess = {
  anon: string[];
  authenticated: string[];
  policies: Omit<Policy, "relation">[];
};

// The declared state of every public table's grants and policies. 0008 revoked
// everything, so an empty entry means closed, and each table's slice replaces
// its own entry as its grants and policies land. A table missing from here
// fails rather than being skipped -- a new table has to say what it opens.
const expected: Record<string, TableAccess> = {
  edges: { anon: [], authenticated: [], policies: [] },
  events: { anon: [], authenticated: [], policies: [] },
  messages: { anon: [], authenticated: [], policies: [] },
  nodes: { anon: [], authenticated: [], policies: [] },
  project_members: {
    anon: [],
    authenticated: ["SELECT"],
    policies: [
      {
        name: "project_members_select_self",
        command: "SELECT",
        roles: "{authenticated}",
        permissive: "PERMISSIVE",
        qual: "(user_id = ( SELECT auth.uid() AS uid))",
        withCheck: null,
      },
    ],
  },
  projects: { anon: [], authenticated: [], policies: [] },
};

let tables: string[] = [];
let grants: Grant[] = [];
let policies: Policy[] = [];

// relacl rather than information_schema, which hides grants made to roles the
// connected user is not a member of.
async function readCatalog(): Promise<void> {
  await withRollback(async (sql) => {
    const relations = await sql.query<{ relation: string }>(
      `select class.relname::text as relation
         from pg_class class
         join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public' and class.relkind = 'r'
        order by 1`,
    );
    tables = relations.rows.map((row) => row.relation);

    const granted = await sql.query<Grant>(
      `select class.relname::text as relation,
              grantee.rolname::text as grantee,
              acl.privilege_type::text as privilege
         from pg_class class
         join pg_namespace namespace on namespace.oid = class.relnamespace
         cross join lateral aclexplode(class.relacl) acl
         join pg_roles grantee on grantee.oid = acl.grantee
        where namespace.nspname = 'public'
          and class.relkind = 'r'
          and grantee.rolname in ('anon', 'authenticated')
        order by 1, 2, 3`,
    );
    grants = granted.rows;

    const declared = await sql.query<Policy>(
      `select tablename::text as relation,
              policyname::text as name,
              cmd::text as command,
              roles::text as roles,
              permissive::text as permissive,
              qual::text as qual,
              with_check::text as "withCheck"
         from pg_policies
        where schemaname = 'public'
        order by 1, 2`,
    );
    policies = declared.rows;
  });
}

function privilegesFor(relation: string, grantee: string): string[] {
  return grants
    .filter((grant) => grant.relation === relation && grant.grantee === grantee)
    .map((grant) => grant.privilege)
    .sort();
}

function policiesFor(relation: string): Omit<Policy, "relation">[] {
  return policies
    .filter((policy) => policy.relation === relation)
    .map(({ relation: _relation, ...rest }) => rest);
}

describe("grant and policy inventory", () => {
  beforeAll(readCatalog);

  it("enumerates the public schema from the catalog", () => {
    expect(tables.length).toBeGreaterThan(0);
  });

  it("declares an entry for every public table", () => {
    expect(tables.filter((table) => !(table in expected))).toEqual([]);
  });

  it("declares nothing that is not a public table", () => {
    expect(Object.keys(expected).filter((table) => !tables.includes(table))).toEqual([]);
  });

  it("grants anon and authenticated exactly what is declared", () => {
    const actual = Object.fromEntries(
      tables.map((table) => [
        table,
        {
          anon: privilegesFor(table, "anon"),
          authenticated: privilegesFor(table, "authenticated"),
        },
      ]),
    );
    const declared = Object.fromEntries(
      tables.map((table) => [
        table,
        {
          anon: [...expected[table].anon].sort(),
          authenticated: [...expected[table].authenticated].sort(),
        },
      ]),
    );
    expect(actual).toEqual(declared);
  });

  it("has exactly the declared policies", () => {
    const actual = Object.fromEntries(tables.map((table) => [table, policiesFor(table)]));
    const declared = Object.fromEntries(tables.map((table) => [table, expected[table].policies]));
    expect(actual).toEqual(declared);
  });

  it("leaves anon without a single grant", () => {
    expect(grants.filter((grant) => grant.grantee === "anon")).toEqual([]);
  });
});
