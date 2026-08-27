import { z } from "zod";

const envSchema = z.object({
  DB_URL: z.string().min(1),
  API_URL: z.string().url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
