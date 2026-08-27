import { z } from "zod";

export const supabaseEnvSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;
