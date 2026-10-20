import { defineConfig } from "vitest/config";

// Deliberately separate from the browser/sharded unit suite. The launcher owns
// the database and refuses existing URLs. No .env files or external endpoints.
export default defineConfig({
  envDir: false,
  test: {
    environment: "node",
    include: ["scripts/tests/fiscal/*.integration.test.ts"],
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    reporters: ["default"],
  },
});
