import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { testClient } from "../clients.ts";
import { env } from "./env.ts";

export const anonClient = () => testClient(env.API_URL, env.ANON_KEY);
export const serviceRoleClient = () => testClient(env.API_URL, env.SERVICE_ROLE_KEY);

export async function signedInClient(credentials: {
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return client;
}

export async function withSql(run: (sql: Client) => Promise<void>): Promise<void> {
  const sql = new Client({ connectionString: env.DB_URL });
  await sql.connect();
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

export function withRollback(run: (sql: Client) => Promise<void>): Promise<void> {
  return withSql(async (sql) => {
    await sql.query("begin");
    try {
      await run(sql);
    } finally {
      await sql.query("rollback");
    }
  });
}

// Reproduces what PostgREST does per request: the JWT claims go in a
// transaction-local GUC, which is where auth.uid() reads the caller's id, and
// the session drops to the authenticated role so RLS applies. Both are
// transaction-scoped, so this only works inside withRollback.
export async function asAuthenticated(
  sql: Client,
  userId: string,
  run: () => Promise<void>,
): Promise<void> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  await sql.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await sql.query("set local role authenticated");
  try {
    await run();
  } finally {
    await sql.query("reset role");
  }
}
