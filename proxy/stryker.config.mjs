import base from "../stryker.config.base.mjs";

export default {
  ...base,
  mutate: ["src/**/*.ts", "!src/**/*.test.ts", "!src/main.ts"],
};
