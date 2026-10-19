import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  envDir: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/multi-tenant-ab/fixtures/stamp-cfdi-booking-claim.vitest.mjs"],
    setupFiles: [],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 35_000,
    hookTimeout: 10_000,
    env: { TZ: "UTC" },
  },
});
