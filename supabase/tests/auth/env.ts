import { z } from "zod";

import { supabaseEnvSchema } from "../../../supabase-env/schema.ts";

const envSchema = supabaseEnvSchema.extend({
  serviceRoleKey: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
