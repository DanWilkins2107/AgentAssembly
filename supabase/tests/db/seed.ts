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

// An owner plus one row in every public table, so an access test can tell "RLS
// filtered the rows away" from "the table was empty anyway".
export type ProjectGraph = { owner: string; project: string; nodes: [string, string] };

// The graph PostgREST reads: owned by a user no test signs in as, and committed
// rather than rolled back because the API reads it over its own connection.
export const foreignGraph: ProjectGraph = {
  owner: "00000000-0000-0000-0000-00000000ac01",
  project: "00000000-0000-0000-0000-00000000ac11",
  nodes: ["00000000-0000-0000-0000-00000000ac21", "00000000-0000-0000-0000-00000000ac22"],
};

export async function seedProjectGraph(sql: Client, graph: ProjectGraph): Promise<void> {
  const { owner, project, nodes } = graph;
  await seedUsers(sql, [owner]);
  await seedProject(sql, project, owner);
  await sql.query(
    `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'owner')`,
    [project, owner],
  );
  await seedNodes(sql, nodes, project, owner);
  await sql.query(
    `insert into public.edges (project_id, source_id, target_id, type, created_by)
     values ($1, $2, $3, 'subtask', $4)`,
    [project, nodes[0], nodes[1], owner],
  );
  await sql.query(
    `insert into public.messages (node_id, project_id, stage, type, author_role, body)
     values ($1, $2, 'human_braindump_needed', 'note', 'system', 'seeded')`,
    [nodes[0], project],
  );
  await sql.query(
    `insert into public.events (project_id, actor_role, type) values ($1, 'system', 'seed')`,
    [project],
  );
}

// Only committed graphs need this; a graph seeded inside withRollback is undone
// by the rollback.
export async function clearProjectGraph(sql: Client, graph: ProjectGraph): Promise<void> {
  for (const table of ["events", "messages", "edges", "nodes", "project_members"]) {
    await sql.query(`delete from public.${table} where project_id = $1`, [graph.project]);
  }
  await sql.query(`delete from public.projects where id = $1`, [graph.project]);
  await sql.query(`delete from auth.users where id = $1`, [graph.owner]);
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
