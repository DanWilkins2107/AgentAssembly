import { execFileSync } from "node:child_process";
import { z } from "zod";

const required = z.string().min(1);

const envSchema = z.object({
  DB_URL: required,
  API_URL: z.string().url(),
  ANON_KEY: required,
  SERVICE_ROLE_KEY: required,
});

export type Env = z.infer<typeof envSchema>;

function supabaseStatusEnv(): Record<string, string> {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const assignments = output.split("\n").flatMap((line) => {
    const match = /^(\w+)="(.*)"$/.exec(line);
    return match ? [[match[1], match[2]] as const] : [];
  });
  return Object.fromEntries(assignments);
}

export const env: Env = envSchema.parse(supabaseStatusEnv());
