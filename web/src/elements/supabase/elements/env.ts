import {
  supabaseEnvSchema,
  type SupabaseEnv,
} from "../../../../../supabase-env/schema";

export const env: SupabaseEnv = supabaseEnvSchema.parse({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
