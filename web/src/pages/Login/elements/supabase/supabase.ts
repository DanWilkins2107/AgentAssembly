import { createClient } from "@supabase/supabase-js";

import { env } from "./elements/env";

export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
);
