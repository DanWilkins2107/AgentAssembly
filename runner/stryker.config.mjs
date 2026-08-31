import base from "../stryker.config.base.mjs";

export default {
  ...base,
  // Tests import ../test-helpers, which a sandboxed package root would not have.
  inPlace: true,
  mutate: [
    "*.ts",
    "!*.test.ts",
    "!*.config.ts",
    "!test-harness.ts",
    "!run-task.ts",
    "!run-judge.ts",
  ],
};
