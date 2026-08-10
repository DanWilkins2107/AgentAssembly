import { createClient } from "@supabase/supabase-js";

import { env } from "./elements/env";

// localStorage tokens are readable by any XSS on this origin. No browser store
// fixes that: this bundle reads the token to attach it to requests, and httpOnly
// cookies need a server we do not have. Risk is bounded server-side instead —
// short access-token TTL + refresh-token rotation with reuse detection.
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
