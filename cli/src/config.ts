import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}

// Secrets are kept out by construction: the schema strips unknown keys, so a
// `password` planted in config.json never reaches a caller. The password is
// env-only (env.ts) and session tokens live in session.ts's store.
const fileSchema = z.object({
  connection: z
    .object({
      url: z.url(),
      anon_key: z.string().min(1),
    })
    .partial()
    .default({}),
  default_project: z.string().min(1).optional(),
  projects: z.record(z.string(), z.object({ email: z.string().min(1) })).default({}),
});

type ConfigFile = z.infer<typeof fileSchema>;

export type Config = {
  connection: { url: string; anon_key: string };
  identity: { email: string };
};

// Mirrors sessionDir() in session.ts; if the ~/.agentjira convention moves in
// one of the two, move it in the other.
export function configDir(): string {
  return join(homedir(), ".agentjira");
}

function readJson(contents: string, path: string): unknown {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new ConfigError(`config file at ${path} is not valid JSON`, { cause: error });
  }
}

function parseConfigFile(contents: string, path: string): ConfigFile {
  const parsed = fileSchema.safeParse(readJson(contents, path));
  if (parsed.success) return parsed.data;
  throw new ConfigError(`config file at ${path} is not a valid config`);
}

function readConfigFile(path: string): ConfigFile {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fileSchema.parse({});
    throw new ConfigError(`failed to read config file at ${path}`, { cause: error });
  }
  return parseConfigFile(contents, path);
}

function emailForProject(file: ConfigFile, key: string, path: string): string {
  const entry = file.projects[key];
  if (entry === undefined) {
    const known = Object.keys(file.projects).join(", ");
    throw new ConfigError(`unknown project "${key}" in ${path}; known projects: ${known}`);
  }
  return entry.email;
}

function fileEmail(file: ConfigFile, project: string | undefined, path: string): string | undefined {
  const key = project ?? file.default_project;
  return key === undefined ? undefined : emailForProject(file, key, path);
}

function required(value: string | undefined, name: string, path: string): string {
  if (!value) {
    throw new ConfigError(`missing ${name}: set the env var or add it to ${path}`);
  }
  return value;
}

function connectionFrom(file: ConfigFile, path: string): Config["connection"] {
  return {
    url: required(process.env.AGENTJIRA_URL || file.connection.url, "AGENTJIRA_URL", path),
    anon_key: required(
      process.env.AGENTJIRA_ANON_KEY || file.connection.anon_key,
      "AGENTJIRA_ANON_KEY",
      path,
    ),
  };
}

export function loadConfig(project?: string, dir: string = configDir()): Config {
  const path = join(dir, "config.json");
  const file = readConfigFile(path);
  const email = process.env.AGENTJIRA_EMAIL || fileEmail(file, project, path);
  return {
    connection: connectionFrom(file, path),
    identity: { email: required(email, "AGENTJIRA_EMAIL", path) },
  };
}
