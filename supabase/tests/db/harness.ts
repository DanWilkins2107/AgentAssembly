import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { env } from "./env.ts";

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } };

export function anonClient(): SupabaseClient {
  return createClient(env.API_URL, env.ANON_KEY, noPersist);
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(env.API_URL, env.SERVICE_ROLE_KEY, noPersist);
}

export async function signedInClient(credentials: {
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return client;
}

export async function withRollback(run: (sql: Client) => Promise<void>): Promise<void> {
  const sql = new Client({ connectionString: env.DB_URL });
  await sql.connect();
  try {
    await sql.query("begin");
    try {
      await run(sql);
    } finally {
      await sql.query("rollback");
    }
  } finally {
    await sql.end();
  }
}
