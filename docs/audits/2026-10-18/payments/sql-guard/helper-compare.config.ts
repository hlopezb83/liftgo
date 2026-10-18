import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../../../../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["docs/audits/2026-10-18/payments/sql-guard/helper-compare.test.ts"],
    maxWorkers: 1,
  },
});
