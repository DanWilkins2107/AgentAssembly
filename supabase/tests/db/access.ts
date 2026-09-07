import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";

export type PolicyShape = {
  name: string;
  command: string;
  roles: string;
  permissive: string;
  qual: string | null;
  withCheck: string | null;
};

export type TableAccess = {
  anon: string[];
  authenticated: string[];
  policies: PolicyShape[];
};

const OPERATIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Operation = (typeof OPERATIONS)[number];

// Every grantee the client tiers reach through. PUBLIC is in here because
// `revoke ... from public` is not what closed anon and authenticated -- Supabase
// grants to those two by name -- so a stray `grant ... to public` would be
// invisible to a check that only looked at the two named roles.
const GRANTEES = ["anon", "authenticated", "public"] as const;

// The file every public table needs, enforced by suite-coverage.test.ts.
export const accessFileFor = (table: string) => `${table.replaceAll("_", "-")}-access.test.ts`;

// A signed-in caller who is a member of nothing, so a granted read returns rows
// only if a policy leaks them.
const NON_MEMBER = "00000000-0000-0000-0000-0000000000ac";

type AclEntry = { grantee: string; privilege: string };
type PgError = { code?: string; message?: string };

const FROM_RELATION = `from pg_class class
       join pg_namespace namespace on namespace.oid = class.relnamespace`;
const IS_THE_TABLE = `namespace.nspname = 'public'
        and class.relkind = 'r'
        and class.relname = $1`;

// relacl, not information_schema, which hides grants made to roles the connected
// user is not a member of. aclexplode reports PUBLIC as grantee oid 0, which has
// no pg_roles row.
const GRANTS = `select coalesce(grantee.rolname::text, 'public') as grantee,
                       acl.privilege_type::text as privilege
                  ${FROM_RELATION}
                  cross join lateral aclexplode(class.relacl) acl
                  left join pg_roles grantee on grantee.oid = acl.grantee
                 where ${IS_THE_TABLE}
                 order by 1, 2`;

const POLICIES = `select policyname::text as name,
                         cmd::text as command,
                         roles::text as roles,
                         permissive::text as permissive,
                         qual::text as qual,
                         with_check::text as "withCheck"
                    from pg_policies
                   where schemaname = 'public' and tablename = $1
                   order by 1`;

// The column the UPDATE probe writes to itself. Identity and generated columns
// are rejected while the statement is still being rewritten (428C9), which is
// before the ACL is consulted, so they would hide the answer we are after.
const WRITABLE_COLUMN = `select attribute.attname::text as column
                           ${FROM_RELATION}
                           join pg_attribute attribute on attribute.attrelid = class.oid
                          where ${IS_THE_TABLE}
                            and attribute.attnum > 0
                            and not attribute.attisdropped
                            and attribute.attidentity = ''
                            and attribute.attgenerated = ''
                          order by attribute.attnum
                          limit 1`;

async function read<Row>(sql: Client, query: string, relation: string): Promise<Row[]> {
  const { rows } = await sql.query<Row>(query, [relation]);
  return rows;
}

function heldBy(grants: AclEntry[]): Record<string, string[]> {
  return Object.fromEntries(
    GRANTEES.map((grantee) => [
      grantee,
      grants
        .filter((grant) => grant.grantee === grantee)
        .map((grant) => grant.privilege)
        .sort(),
    ]),
  );
}

// `where false` and `default values` keep every probe from depending on the
// data: Postgres checks the table ACL before it looks at rows or constraints,
// so a refusal here is the grant talking.
function statementFor(relation: string, operation: Operation, column: string): string {
  switch (operation) {
    case "SELECT":
      return `select 1 from public."${relation}" limit 1`;
    case "INSERT":
      return `insert into public."${relation}" default values`;
    case "UPDATE":
      return `update public."${relation}" set "${column}" = "${column}" where false`;
    case "DELETE":
      return `delete from public."${relation}" where false`;
  }
}

// RLS refusals share SQLSTATE 42501 with grant refusals, so the message is what
// separates them: only a missing grant says "permission denied".
function outcomeOf(error: PgError): string {
  const byGrant = error.code === "42501" && error.message?.startsWith("permission denied");
  return byGrant ? "denied" : `${error.code}: ${error.message}`;
}

// A refused statement aborts the transaction, which would then reject the role
// reset on the way out. The savepoint keeps the failure local.
async function probe(sql: Client, statement: string): Promise<string> {
  await sql.query("savepoint probe");
  try {
    await sql.query(statement);
    return "allowed";
  } catch (caught) {
    await sql.query("rollback to savepoint probe");
    return outcomeOf(caught as PgError);
  }
}

/**
 * Declares one table's whole access surface: the privileges anon, authenticated
 * and PUBLIC hold, the policies on the table, and -- run against the database as
 * a signed-in caller -- whether each of select/insert/update/delete is blocked
 * or open. Every public table owns one of these; suite-coverage.test.ts fails a
 * table that has none.
 */
export function describeAccess(relation: string, expected: TableAccess): void {
  describe(`${relation} access`, () => {
    let grants: AclEntry[] = [];
    let policies: PolicyShape[] = [];
    let column = "";

    beforeAll(async () => {
      await withRollback(async (sql) => {
        grants = await read<AclEntry>(sql, GRANTS, relation);
        policies = await read<PolicyShape>(sql, POLICIES, relation);
        const writable = await read<{ column: string }>(sql, WRITABLE_COLUMN, relation);
        if (writable.length === 0) throw new Error(`no writable column on ${relation}`);
        column = writable[0].column;
      });
    });

    it("holds exactly the declared privileges", () => {
      expect(heldBy(grants)).toEqual({
        anon: [...expected.anon].sort(),
        authenticated: [...expected.authenticated].sort(),
        public: [],
      });
    });

    it("has exactly the declared policies", () => {
      expect(policies).toEqual(expected.policies);
    });

    for (const operation of OPERATIONS) {
      const open = expected.authenticated.includes(operation);
      it(`${open ? "opens" : "blocks"} ${operation} for a signed-in caller`, async () => {
        await withRollback(async (sql) => {
          await asAuthenticated(sql, NON_MEMBER, async () => {
            const outcome = await probe(sql, statementFor(relation, operation, column));
            if (open) expect(outcome).not.toBe("denied");
            else expect(outcome).toBe("denied");
          });
        });
      });
    }
  });
}
