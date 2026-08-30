// fallow-ignore-file code-duplication -- this env schema tokenizes the same as the unrelated session schema in cli/src/session.ts; coincidence, not shared code.
import { execFileSync } from "node:child_process";
import { z } from "zod";

const envSchema = z.object({
  DB_URL: z.string().min(1),
  API_URL: z.string().url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
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
