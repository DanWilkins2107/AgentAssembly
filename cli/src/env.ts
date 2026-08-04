import { z } from "zod";

const required = z.string().min(1);

const envSchema = z.object({
  AGENTJIRA_URL: z.url(),
  AGENTJIRA_ANON_KEY: required,
  AGENTJIRA_EMAIL: required,
  AGENTJIRA_PASSWORD: required,
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
