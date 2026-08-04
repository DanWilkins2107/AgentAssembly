import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Assigned over process.env in every worker, so src/env.ts parses these and
    // never a developer's exported AGENTJIRA_* values. src/client.test.ts
    // asserts them; change both together.
    env: {
      AGENTJIRA_URL: "https://store.example",
      AGENTJIRA_ANON_KEY: "anon-key",
      AGENTJIRA_EMAIL: "agent@example.com",
      AGENTJIRA_PASSWORD: "agent-password",
    },
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/env.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
});
