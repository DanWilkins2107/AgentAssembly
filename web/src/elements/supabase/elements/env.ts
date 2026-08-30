import { supabaseEnvSchema } from "../../../../../supabase/env-schema";

export const env = supabaseEnvSchema.parse({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
