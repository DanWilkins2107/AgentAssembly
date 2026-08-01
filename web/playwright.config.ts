import { defineConfig } from "@playwright/test";

const BASE_URL = "http://localhost:5173/evidence/";

export default defineConfig({
  testDir: "./evidence",
  testMatch: "capture.ts",
  outputDir: "./evidence/out",
  use: {
    baseURL: BASE_URL,
    video: "on",
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: BASE_URL,
    reuseExistingServer: true,
  },
});
