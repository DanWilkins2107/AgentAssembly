import { z } from "zod";

import { supabaseEnvSchema } from "../../../supabase-env/schema.ts";

export const env = supabaseEnvSchema.parse({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
});

export const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
