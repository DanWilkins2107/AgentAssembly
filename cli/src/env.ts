import { z } from "zod";

const envSchema = z.object({
  AGENTJIRA_URL: z.url(),
  AGENTJIRA_ANON_KEY: z.string().min(1),
  AGENTJIRA_EMAIL: z.string().min(1),
  AGENTJIRA_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
