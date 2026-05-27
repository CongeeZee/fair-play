import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    include: ["src/tests/*.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
    fileParallelism: false,
  },
});
