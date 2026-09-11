import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedProject, seedUsers } from "./seed.ts";

const MEMBER = "00000000-0000-0000-0000-000000000401";
const OTHER_MEMBER = "00000000-0000-0000-0000-000000000402";
const EMPTY_MEMBER = "00000000-0000-0000-0000-000000000403";
const OUTSIDER = "00000000-0000-0000-0000-000000000404";
const MINE = "00000000-0000-0000-0000-000000000410";
const THEIRS = "00000000-0000-0000-0000-000000000411";
const EMPTY = "00000000-0000-0000-0000-000000000412";
const UNPEOPLED = "00000000-0000-0000-0000-000000000413";

// Four projects with no overlapping membership, so "only your own project's
// events" has something to be wrong about. Without a second project a predicate
// whose project_id resolves to project_members' own column reads as correct;
// UNPEOPLED has no members at all, and EMPTY has a member but no events, so a
// predicate that only asks "does this caller belong to anything" is wrong too.
// The event in THEIRS names MEMBER as its actor: being the subject of an audit
// row is not membership of the project that recorded it.
async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [MEMBER, OTHER_MEMBER, EMPTY_MEMBER, OUTSIDER]);
  await seedProject(sql, MINE, MEMBER);
  await seedProject(sql, THEIRS, OTHER_MEMBER);
  await seedProject(sql, EMPTY, EMPTY_MEMBER);
  await seedProject(sql, UNPEOPLED, OUTSIDER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($3, $4, 'owner'), ($5, $6, 'owner')`,
    [MINE, MEMBER, THEIRS, OTHER_MEMBER, EMPTY, EMPTY_MEMBER],
  );
  await sql.query(
    `insert into public.events (project_id, actor_id, actor_role, type)
     values ($1, $2, 'human', 'mine'),
            ($3, $2, 'human', 'theirs'),
            ($4, null, 'system', 'unpeopled')`,
    [MINE, MEMBER, THEIRS, UNPEOPLED],
  );
}

// Identity ids are assigned per session, so the type column is what names a row.
// Ordered by id, which is the order seed() wrote them.
async function visibleEvents(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ type: string }>(`select type from public.events order by id`);
  return rows.map((row) => row.type);
}

// A refused statement aborts the transaction, so the savepoint keeps the failure
// local and lets asAuthenticated reset the role on the way out.
async function refusal(sql: Client, attempt: () => Promise<unknown>): Promise<string> {
  await sql.query("savepoint attempt");
  try {
    await attempt();
    return "allowed";
  } catch (caught) {
    await sql.query("rollback to savepoint attempt");
    const error = caught as { code?: string; message?: string };
    return `${error.code}: ${error.message}`;
  }
}

// Grant refusals and policy refusals share 42501; only a grant says this.
const DENIED_BY_GRANT = "42501: permission denied for table events";

describe("events select policy", () => {
  it("shows a member their own project's events and no others", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await visibleEvents(sql)).toEqual(["mine"]);
      });
    });
  });

  it("shows a member of an eventless project nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, EMPTY_MEMBER, async () => {
        expect(await visibleEvents(sql)).toEqual([]);
      });
    });
  });

  it("shows a non-member nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleEvents(sql)).toEqual([]);
      });
    });
  });

  it("shows a member of two projects both trails, and still nothing else", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await sql.query(
        `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'agent')`,
        [THEIRS, MEMBER],
      );
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await visibleEvents(sql)).toEqual(["mine", "theirs"]);
      });
    });
  });
});

// The audit trail is written server-side under service_role, which bypasses RLS,
// so no client ever needs INSERT and there is no insert policy to reach. 0009's
// events_forbid_update and events_forbid_delete triggers make an event
// append-only, and withholding those grants stops a member one layer earlier --
// at a permission denial rather than a raised exception.
describe("events are read-only for a signed-in caller", () => {
  it("refuses a member recording an event in their own project, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            sql.query(
              `insert into public.events (project_id, actor_id, actor_role, type)
               values ($1, $2, 'human', 'forged')`,
              [MINE, MEMBER],
            ),
          ),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });

  it("refuses a member editing an event in their own project, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            sql.query(`update public.events set type = 'edited' where project_id = $1`, [MINE]),
          ),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });

  it("refuses a member deleting an event in their own project, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            sql.query(`delete from public.events where project_id = $1`, [MINE]),
          ),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });
});
