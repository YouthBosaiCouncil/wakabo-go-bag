import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "server-only": path.resolve("tests/server-only.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
