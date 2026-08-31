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
