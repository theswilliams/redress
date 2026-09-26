import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // `npm test` runs unit/route tests only; the HTTP smoke tests (e2e/) run via `npm run test:e2e`.
    include: process.env.E2E_BASE_URL ? ["e2e/**/*.test.ts"] : ["src/**/*.test.ts"],
    testTimeout: process.env.E2E_BASE_URL ? 60_000 : 5_000,
    fileParallelism: !process.env.E2E_BASE_URL,
  },
});
