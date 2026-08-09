import { createClient } from "@supabase/supabase-js";

import { env } from "./elements/env";

// localStorage tokens are readable by any XSS on this origin. Accepted: sessions
// must survive reload and every browser-side store is XSS-reachable. Mitigation is
// short access-token TTL + refresh rotation, not the storage choice.
export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      detectSessionInUrl: false,
    },
  },
);
