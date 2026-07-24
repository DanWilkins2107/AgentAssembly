import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { env } from "./env.ts";

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } };

export function anonClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, noPersist);
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, noPersist);
}

export async function provisionUser(
  admin: SupabaseClient,
  credentials: { email: string; password: string },
): Promise<User> {
  const { data, error } = await admin.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

export async function deleteUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
