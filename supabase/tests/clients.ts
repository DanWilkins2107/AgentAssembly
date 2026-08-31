import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Tests get a fresh client per call and never touch disk, so token refresh and
// session persistence are both off.
const noPersist = { auth: { autoRefreshToken: false, persistSession: false } };

export function testClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, noPersist);
}
