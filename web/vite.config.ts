/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // tests/palette-gate.test.ts reads .css files raw; vitest stubs them empty without this.
    css: true,
  },
});
