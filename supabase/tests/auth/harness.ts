import type { SupabaseClient, User } from "@supabase/supabase-js";
import { testClient } from "../clients.ts";
import { env, serviceRoleKey } from "./env.ts";

export const anonClient = () => testClient(env.url, env.anonKey);
export const serviceRoleClient = () => testClient(env.url, serviceRoleKey);

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
