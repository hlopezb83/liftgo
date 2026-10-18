import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(fixtureRoot, "../../../..");
const sourceRoot = resolve(process.env.K1_CANDIDATE_SRC ?? resolve(workspaceRoot, "src"));

export default defineConfig({
  root: fixtureRoot,
  plugins: [react()],
  resolve: { alias: { "@": sourceRoot } },
  test: {
    environment: "happy-dom",
    globals: true,
    // Keep the existing fetch barrier and offline environment for either source
    // tree. No transport, database, or real authorization is exercised here.
    setupFiles: [resolve(workspaceRoot, "src/test/setup.ts")],
    include: ["client-form.test.tsx"],
    pool: "forks",
    minWorkers: 1,
    maxWorkers: 1,
    env: {
      TZ: "UTC",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline",
      VITE_SUPABASE_PROJECT_ID: "test-offline",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_offline",
      SUPABASE_PROJECT_ID: "test-offline",
    },
  },
});
