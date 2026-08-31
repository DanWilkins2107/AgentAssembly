import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { asAuthenticated, withRollback } from "./harness.ts";
import { seedProject, seedProjectGraph, seedUsers, type ProjectGraph } from "./seed.ts";

const AGENT = "00000000-0000-0000-0000-00000000ab02";
const OUTSIDER = "00000000-0000-0000-0000-00000000ab03";
const OTHER_PROJECT = "00000000-0000-0000-0000-00000000ab12";

const GRAPH: ProjectGraph = {
  owner: "00000000-0000-0000-0000-00000000ab01",
  project: "00000000-0000-0000-0000-00000000ab11",
  nodes: ["00000000-0000-0000-0000-00000000ab21", "00000000-0000-0000-0000-00000000ab22"],
};
const { owner: OWNER, project: PROJECT, nodes: NODES } = GRAPH;

// Every public table, with a column the client actually has a grant on --
// `select 1` would test table-level privilege, which the column-level grants
// deliberately do not give.
const RELATIONS: [string, string][] = [
  ["projects", "id"],
  ["project_members", "project_id"],
  ["nodes", "id"],
  ["edges", "id"],
  ["messages", "id"],
  ["events", "id"],
];

const HELPERS = [
  "public.is_project_member(uuid)",
  "public.is_project_owner(uuid)",
  "public.is_project_member_path(text)",
  "public.current_actor_role(uuid)",
];

// OUTSIDER owns a second project so a member of the first is a non-member of a
// real project, not of a missing one.
function withGraph(run: (sql: Client) => Promise<void>): Promise<void> {
  return withRollback(async (sql) => {
    await seedUsers(sql, [AGENT, OUTSIDER]);
    await seedProjectGraph(sql, GRAPH);
    await seedProject(sql, OTHER_PROJECT, OUTSIDER);
    await sql.query(
      `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'agent')`,
      [PROJECT, AGENT],
    );
    await run(sql);
  });
}

async function scalar(sql: Client, expression: string): Promise<unknown> {
  const { rows } = await sql.query<{ value: unknown }>(`select ${expression} as value`);
  return rows[0]?.value;
}

async function readableRelations(sql: Client, userId: string): Promise<string[]> {
  await asAuthenticated(sql, userId);
  const seen: string[] = [];
  for (const [relation, column] of RELATIONS) {
    const { rows } = await sql.query(`select ${column} from public.${relation} limit 1`);
    if (rows.length > 0) seen.push(relation);
  }
  return seen;
}

async function privileges(sql: Client, role: string): Promise<string[]> {
  const { rows } = await sql.query<{ granted: string }>(
    `select distinct class.relname || ':' || privilege as granted
       from pg_class class
       join pg_namespace ns on ns.oid = class.relnamespace
       join pg_attribute att
         on att.attrelid = class.oid and att.attnum > 0 and not att.attisdropped
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privilege
      where ns.nspname = 'public' and class.relkind = 'r'
        and has_column_privilege($1, class.oid, att.attnum, privilege)
      union
     select class.relname || ':' || privilege
       from pg_class class
       join pg_namespace ns on ns.oid = class.relnamespace
       cross join unnest(array['DELETE', 'TRUNCATE', 'TRIGGER']) as privilege
      where ns.nspname = 'public' and class.relkind = 'r'
        and has_table_privilege($1, class.oid, privilege)
      order by 1`,
    [role],
  );
  return rows.map((row) => row.granted);
}

describe("membership helpers", () => {
  const cases: [string, string, string, unknown][] = [
    ["is_project_member true for a member", AGENT, `public.is_project_member('${PROJECT}')`, true],
    [
      "is_project_member false for a non-member",
      OUTSIDER,
      `public.is_project_member('${PROJECT}')`,
      false,
    ],
    ["is_project_owner true for the owner", OWNER, `public.is_project_owner('${PROJECT}')`, true],
    [
      "is_project_owner false for an agent member",
      AGENT,
      `public.is_project_owner('${PROJECT}')`,
      false,
    ],
    [
      "is_project_member_path true for the member's own prefix",
      AGENT,
      `public.is_project_member_path('${PROJECT}/canvas.png')`,
      true,
    ],
    [
      "is_project_member_path false for another project's prefix",
      AGENT,
      `public.is_project_member_path('${OTHER_PROJECT}/canvas.png')`,
      false,
    ],
    [
      "is_project_member_path false for a name that is not uuid-prefixed",
      AGENT,
      `public.is_project_member_path('../canvas.png')`,
      false,
    ],
    [
      "is_project_member_path false for a bare project id with no object after it",
      AGENT,
      `public.is_project_member_path('${PROJECT}')`,
      false,
    ],
    [
      "current_actor_role human for the owner",
      OWNER,
      `public.current_actor_role('${PROJECT}')`,
      "human",
    ],
    [
      "current_actor_role agent for an agent member",
      AGENT,
      `public.current_actor_role('${PROJECT}')`,
      "agent",
    ],
    [
      "current_actor_role null for a non-member",
      OUTSIDER,
      `public.current_actor_role('${PROJECT}')`,
      null,
    ],
  ];

  it.each(cases)("returns %s", async (_case, userId, expression, expected) => {
    await withGraph(async (sql) => {
      await asAuthenticated(sql, userId);
      expect(await scalar(sql, expression)).toEqual(expected);
    });
  });

  it("returns current_actor_role system when there is no signed-in user", async () => {
    await withGraph(async (sql) => {
      expect(await scalar(sql, `public.current_actor_role('${PROJECT}')`)).toEqual("system");
    });
  });

  it.each(HELPERS)(
    "makes %s a stable security definer with a pinned search_path",
    async (helper) => {
      await withRollback(async (sql) => {
        const { rows } = await sql.query<{
          prosecdef: boolean;
          provolatile: string;
          config: string;
        }>(
          `select prosecdef, provolatile::text, array_to_string(proconfig, ',') as config
           from pg_proc where oid = $1::regprocedure`,
          [helper],
        );
        expect(rows[0]).toMatchObject({ prosecdef: true, provolatile: "s" });
        // The exact stored form of an empty search_path is a Postgres detail; what
        // matters is that the function sets one rather than inheriting the caller's.
        expect(rows[0]?.config).toMatch(/^search_path=/);
      });
    },
  );

  it.each([
    ["anon", false],
    ["authenticated", true],
  ])("gives %s execute on the helpers: %s", async (role, expected) => {
    await withRollback(async (sql) => {
      const granted = await Promise.all(
        HELPERS.map((helper) =>
          scalar(sql, `has_function_privilege('${role}', '${helper}', 'EXECUTE')`),
        ),
      );
      expect(granted).toEqual(HELPERS.map(() => expected));
    });
  });
});

describe("row visibility", () => {
  it("shows a member every table", async () => {
    await withGraph(async (sql) => {
      expect(await readableRelations(sql, AGENT)).toEqual(RELATIONS.map(([relation]) => relation));
    });
  });

  it("shows a non-member no table", async () => {
    await withGraph(async (sql) => {
      expect(await readableRelations(sql, OUTSIDER)).toEqual([]);
    });
  });
});

describe("write policies", () => {
  const refusals: [string, string, string][] = [
    [
      "insert a row into a project they are not in",
      OUTSIDER,
      `insert into public.nodes (project_id, title, status, created_by)
       values ('${PROJECT}', 'Smuggled', 'done', '${OUTSIDER}')`,
    ],
    [
      "move a row into a project they are not in",
      AGENT,
      `update public.nodes set project_id = '${OTHER_PROJECT}' where id = '${NODES[0]}'`,
    ],
    ["delete a row", AGENT, `delete from public.nodes where id = '${NODES[0]}'`],
    ["read projects.webhook_secret", OWNER, `select webhook_secret from public.projects`],
    [
      "overwrite projects.webhook_secret",
      OWNER,
      `update public.projects set webhook_secret = 'forged' where id = '${PROJECT}'`,
    ],
    [
      "grant themselves membership",
      AGENT,
      `insert into public.project_members (project_id, user_id, role)
       values ('${OTHER_PROJECT}', '${AGENT}', 'owner')`,
    ],
    [
      "write the audit log",
      AGENT,
      `insert into public.events (project_id, actor_role, type) values ('${PROJECT}', 'human', 'forged')`,
    ],
  ];

  it.each(refusals)("refuses to let a client %s", async (_case, userId, statement) => {
    await withGraph(async (sql) => {
      await asAuthenticated(sql, userId);
      await expect(sql.query(statement)).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("lets a member add a node to their own project", async () => {
    await withGraph(async (sql) => {
      await asAuthenticated(sql, AGENT);
      const result = await sql.query(
        `insert into public.nodes (project_id, title, status, created_by)
         values ($1, 'Mine', 'done', $2)`,
        [PROJECT, AGENT],
      );
      expect(result.rowCount).toEqual(1);
    });
  });

  it.each([
    ["the owner", OWNER, 1],
    ["an agent member", AGENT, 0],
  ])("lets %s rename the project: %i rows", async (_case, userId, expected) => {
    await withGraph(async (sql) => {
      await asAuthenticated(sql, userId);
      const result = await sql.query(`update public.projects set name = 'Renamed' where id = $1`, [
        PROJECT,
      ]);
      expect(result.rowCount).toEqual(expected);
    });
  });
});

describe("grants", () => {
  it("gives anon nothing in the public schema", async () => {
    await withRollback(async (sql) => {
      expect(await privileges(sql, "anon")).toEqual([]);
    });
  });

  // The reviewed allowlist. Anything absent here -- every DELETE, every write to
  // project_members or events, any privilege on a table added later -- is denied
  // by the grant layer before RLS is ever consulted.
  it("gives authenticated exactly the reviewed privileges", async () => {
    await withRollback(async (sql) => {
      expect(await privileges(sql, "authenticated")).toEqual([
        "edges:INSERT",
        "edges:SELECT",
        "edges:UPDATE",
        "events:SELECT",
        "messages:INSERT",
        "messages:SELECT",
        "messages:UPDATE",
        "nodes:INSERT",
        "nodes:SELECT",
        "nodes:UPDATE",
        "project_members:SELECT",
        "projects:SELECT",
        "projects:UPDATE",
      ]);
    });
  });

  it.each(["anon", "authenticated"])(
    "withholds every privilege on projects.webhook_secret from %s",
    async (role) => {
      await withRollback(async (sql) => {
        const { rows } = await sql.query(
          `select privilege from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'])
             as privilege
            where has_column_privilege($1, 'public.projects', 'webhook_secret', privilege)`,
          [role],
        );
        expect(rows).toEqual([]);
      });
    },
  );
});

describe("policy coverage", () => {
  it("enables row level security on every public table", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query(
        `select relname from pg_class class
           join pg_namespace ns on ns.oid = class.relnamespace
          where ns.nspname = 'public' and class.relkind = 'r' and not class.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    });
  });

  // The full policy inventory. Nothing here is DELETE -- removal is a flag
  // (edges.removed_at) or a status, never a delete -- and nothing here applies
  // to anon, so a policy added for the wrong command or the wrong role fails
  // this test rather than quietly widening access.
  it("defines exactly these policies in public", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ policy: string }>(
        `select tablename || '.' || policyname || ': ' || cmd || ' to ' ||
                array_to_string(roles, ',') as policy
           from pg_policies where schemaname = 'public' order by 1`,
      );
      expect(rows.map((row) => row.policy)).toEqual([
        "edges.edges_insert: INSERT to authenticated",
        "edges.edges_select: SELECT to authenticated",
        "edges.edges_update: UPDATE to authenticated",
        "events.events_select: SELECT to authenticated",
        "messages.messages_insert: INSERT to authenticated",
        "messages.messages_select: SELECT to authenticated",
        "messages.messages_update: UPDATE to authenticated",
        "nodes.nodes_insert: INSERT to authenticated",
        "nodes.nodes_select: SELECT to authenticated",
        "nodes.nodes_update: UPDATE to authenticated",
        "project_members.project_members_select: SELECT to authenticated",
        "projects.projects_select: SELECT to authenticated",
        "projects.projects_update: UPDATE to authenticated",
      ]);
    });
  });
});
