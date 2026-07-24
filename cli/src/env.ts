import { z } from "zod";

const envSchema = z.object({
  AGENTJIRA_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
