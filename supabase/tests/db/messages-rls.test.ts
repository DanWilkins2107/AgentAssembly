import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedNodes, seedProject, seedUsers } from "./seed.ts";

const MEMBER = "00000000-0000-0000-0000-000000000301";
const OTHER_MEMBER = "00000000-0000-0000-0000-000000000302";
const OUTSIDER = "00000000-0000-0000-0000-000000000303";
const MINE = "00000000-0000-0000-0000-000000000310";
const THEIRS = "00000000-0000-0000-0000-000000000311";
const MY_NODE = "00000000-0000-0000-0000-000000000320";
const THEIR_NODE = "00000000-0000-0000-0000-000000000321";
const MY_MESSAGE = "00000000-0000-0000-0000-000000000330";
const THEIR_MESSAGE = "00000000-0000-0000-0000-000000000331";

// Two projects, each with a node and a message, and no overlapping membership --
// so "only your own project's messages" has something to be wrong about.
// Without a second project a predicate whose project_id resolves to
// project_members' own column reads as correct.
async function seed(sql: Client): Promise<void> {
  await seedUsers(sql, [MEMBER, OTHER_MEMBER, OUTSIDER]);
  await seedProject(sql, MINE, MEMBER);
  await seedProject(sql, THEIRS, OTHER_MEMBER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role)
     values ($1, $2, 'owner'), ($3, $4, 'owner')`,
    [MINE, MEMBER, THEIRS, OTHER_MEMBER],
  );
  await seedNodes(sql, [MY_NODE], MINE, MEMBER);
  await seedNodes(sql, [THEIR_NODE], THEIRS, OTHER_MEMBER);
  await sql.query(
    `insert into public.messages
       (id, node_id, project_id, stage, type, author_role, author_id, body)
     values ($1, $2, $3, 'human_braindump_needed', 'note', 'human', $4, 'Mine'),
            ($5, $6, $7, 'human_braindump_needed', 'note', 'human', $8, 'Theirs')`,
    [MY_MESSAGE, MY_NODE, MINE, MEMBER, THEIR_MESSAGE, THEIR_NODE, THEIRS, OTHER_MEMBER],
  );
}

async function visibleMessages(sql: Client): Promise<string[]> {
  const { rows } = await sql.query<{ id: string }>(`select id from public.messages order by id`);
  return rows.map((row) => row.id);
}

// node_id and project_id have to agree: 0009 replaced the node reference with a
// composite foreign key, which would otherwise be what refuses a cross-project
// message rather than the policy.
function post(
  sql: Client,
  message: { node: string; project: string; author: string | null },
): Promise<unknown> {
  return sql.query(
    `insert into public.messages (node_id, project_id, stage, type, author_role, author_id, body)
     values ($1, $2, 'human_braindump_needed', 'note', 'human', $3, 'Posted')`,
    [message.node, message.project, message.author],
  );
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

const VIOLATES_POLICY = '42501: new row violates row-level security policy for table "messages"';
// Grant refusals and policy refusals share 42501; only a grant says this.
const DENIED_BY_GRANT = "42501: permission denied for table messages";

describe("messages select policy", () => {
  it("shows a member the messages of their own project and no others", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(await visibleMessages(sql)).toEqual([MY_MESSAGE]);
      });
    });
  });

  it("shows a non-member nothing", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, OUTSIDER, async () => {
        expect(await visibleMessages(sql)).toEqual([]);
      });
    });
  });
});

describe("messages insert policy", () => {
  it("lets a member post to their own project under their own name", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        await post(sql, { node: MY_NODE, project: MINE, author: MEMBER });
        expect(await visibleMessages(sql)).toHaveLength(2);
      });
    });
  });

  it("refuses a message in a project the caller is not a member of", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            post(sql, { node: THEIR_NODE, project: THEIRS, author: MEMBER }),
          ),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });

  // Membership alone would let one member sign a message with another's id, so
  // the policy pins author_id as well.
  it("refuses a member posting under another member's name", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            post(sql, { node: MY_NODE, project: MINE, author: OTHER_MEMBER }),
          ),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });

  // `null = uid` is unknown, which WITH CHECK treats as a failure. Unsigned
  // system messages stay a service-role write, and service_role bypasses RLS.
  it("refuses an unsigned message from a signed-in caller", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () => post(sql, { node: MY_NODE, project: MINE, author: null })),
        ).toBe(VIOLATES_POLICY);
      });
    });
  });
});

// 0009's messages_forbid_update and messages_forbid_delete triggers make a
// message append-only, and withholding the grants stops a member one layer
// earlier -- at a permission denial rather than a raised exception. Which means
// no UPDATE or DELETE policy exists to be exercised.
describe("messages are append-only", () => {
  it("refuses a member editing their own message, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            sql.query(`update public.messages set body = 'edited' where id = $1`, [MY_MESSAGE]),
          ),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });

  it("refuses a member deleting their own message, at the grant", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      await asAuthenticated(sql, MEMBER, async () => {
        expect(
          await refusal(sql, () =>
            sql.query(`delete from public.messages where id = $1`, [MY_MESSAGE]),
          ),
        ).toBe(DENIED_BY_GRANT);
      });
    });
  });
});
