import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { clearSession, getSession, setSession, type SessionBundle } from "./session.js";

export class AuthError extends Error {
  name = "AuthError";
}

type SessionResponse = {
  data: { session: Session | null };
  error: unknown;
};

// Supabase returns a null session on every auth failure, so its absence is the
// failure signal; the accompanying error is kept as the cause.
async function requireSession(response: SessionResponse, message: string): Promise<Session> {
  const { session } = response.data;
  if (session) return session;
  await clearSession();
  throw new AuthError(message, { cause: response.error });
}

async function resume(client: SupabaseClient, cached: SessionBundle): Promise<Session> {
  const response = await client.auth.setSession(cached);
  return requireSession(response, "failed to refresh the cached session");
}

async function signIn(client: SupabaseClient): Promise<Session> {
  const response = await client.auth.signInWithPassword({
    email: env.AGENTJIRA_EMAIL,
    password: env.AGENTJIRA_PASSWORD,
  });
  return requireSession(response, "failed to sign in");
}

export async function connect(): Promise<SupabaseClient> {
  // Node has no localStorage, so supabase-js would fall back to in-memory
  // storage: tokens would die with the process and every command would sign in
  // again. session.ts is the durable store instead. autoRefreshToken is off
  // because its background timer would outlive a one-shot CLI command; the
  // setSession call below still refreshes an expired access token.
  const client = createClient(env.AGENTJIRA_URL, env.AGENTJIRA_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cached = await getSession();
  const session = await (cached ? resume(client, cached) : signIn(client));
  await setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return client;
}
