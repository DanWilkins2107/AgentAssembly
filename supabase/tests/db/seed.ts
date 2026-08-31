import type { Client, QueryResult } from "pg";

// auth.users is owned by GoTrue, so tests insert into it directly rather than
// signing users up. Emails are derived from the id to stay unique per call.
export function seedUsers(sql: Client, ids: string[]): Promise<QueryResult> {
  return sql.query(
    `insert into auth.users
       (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            id::text || '@example.test', '', now(), now()
       from unnest($1::uuid[]) as id`,
    [ids],
  );
}

export function seedProject(sql: Client, id: string, createdBy: string): Promise<QueryResult> {
  return sql.query(
    `insert into public.projects (id, name, created_by) values ($1, 'Test project', $2)`,
    [id, createdBy],
  );
}

export function seedNodes(
  sql: Client,
  ids: string[],
  projectId: string,
  createdBy: string,
  status = "human_braindump_needed",
): Promise<QueryResult> {
  return sql.query(
    `insert into public.nodes (id, project_id, title, status, created_by)
     select unnest($1::uuid[]), $2::uuid, 'Test node', $3::public.node_status, $4::uuid`,
    [ids, projectId, status, createdBy],
  );
}

const FIXTURE_OWNER = "00000000-0000-0000-0000-00000000f001";
const FIXTURE_PROJECT = "00000000-0000-0000-0000-00000000f010";
const FIXTURE_NODES = [
  "00000000-0000-0000-0000-00000000f020",
  "00000000-0000-0000-0000-00000000f021",
];
const FIXTURE_EDGE = "00000000-0000-0000-0000-00000000f030";
const FIXTURE_MESSAGE = "00000000-0000-0000-0000-00000000f040";

export async function removeRowPerTable(sql: Client): Promise<void> {
  await sql.query(`delete from public.events where project_id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from public.messages where project_id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from public.edges where project_id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from public.nodes where project_id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from public.project_members where project_id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from public.projects where id = $1`, [FIXTURE_PROJECT]);
  await sql.query(`delete from auth.users where id = $1`, [FIXTURE_OWNER]);
}

// One committed row in every public table, owned by a user no test signs in as,
// so a signed-in non-member reading zero rows can only mean RLS held the door.
// Removes first, so a run that crashed before its cleanup does not wedge the next.
export async function seedRowPerTable(sql: Client): Promise<void> {
  await removeRowPerTable(sql);
  await seedUsers(sql, [FIXTURE_OWNER]);
  await seedProject(sql, FIXTURE_PROJECT, FIXTURE_OWNER);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'owner')`,
    [FIXTURE_PROJECT, FIXTURE_OWNER],
  );
  await seedNodes(sql, FIXTURE_NODES, FIXTURE_PROJECT, FIXTURE_OWNER);
  await sql.query(
    `insert into public.edges (id, project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, $4, 'subtask', $5)`,
    [FIXTURE_EDGE, FIXTURE_PROJECT, FIXTURE_NODES[0], FIXTURE_NODES[1], FIXTURE_OWNER],
  );
  await sql.query(
    `insert into public.messages (id, node_id, project_id, stage, type, author_role, author_id, body)
     values ($1, $2, $3, 'human_braindump_needed', 'note', 'human', $4, 'Fixture message')`,
    [FIXTURE_MESSAGE, FIXTURE_NODES[0], FIXTURE_PROJECT, FIXTURE_OWNER],
  );
  await sql.query(
    `insert into public.events (project_id, node_id, actor_id, actor_role, type)
     values ($1, $2, $3, 'human', 'fixture.seeded')`,
    [FIXTURE_PROJECT, FIXTURE_NODES[0], FIXTURE_OWNER],
  );
}

// Column-by-column insert, so a test can omit a column to prove it is NOT NULL.
export function insertRow(
  sql: Client,
  table: string,
  columns: Record<string, unknown>,
): Promise<QueryResult> {
  const names = Object.keys(columns);
  const placeholders = names.map((_, index) => `$${index + 1}`);
  return sql.query(
    `insert into ${table} (${names.join(", ")}) values (${placeholders.join(", ")}) returning *`,
    Object.values(columns),
  );
}
