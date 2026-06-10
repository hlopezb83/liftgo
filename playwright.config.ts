import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for LiftGo E2E tests.
 *
 * - Tests run against a local `bun run preview` server on port 4173.
 * - In CI we install a chromium-only runtime.
 * - The auth fixture writes a storageState file so most flows skip login.
 *
 * Required env vars (read in tests/e2e/fixtures/auth.ts):
 *   E2E_BASE_URL              defaults to http://localhost:4173
 *   E2E_TEST_EMAIL            admin user for the test
 *   E2E_TEST_PASSWORD         admin user password
 *   VITE_SUPABASE_URL         (already in .env)
 *   VITE_SUPABASE_PUBLISHABLE_KEY  (already in .env)
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";
// SHARD_INDEX is set per-job in CI matrix sharding ("1", "2", …). Used to scope artifact paths so
// shards don't overwrite each other when uploaded.
const shardSuffix = process.env.SHARD_INDEX ? `-shard${process.env.SHARD_INDEX}` : "";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Each test gets a unique `e2e_scope` from the seed fixture, so workers can run in parallel without
  // racing on the global teardown. Tune CI workers per shard (2 × N shards = effective parallelism).
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: `playwright-report${shardSuffix}`, open: "never" }],
        ["junit", { outputFile: `reports/playwright-junit${shardSuffix}.xml` }],
        ["json", { outputFile: `reports/playwright${shardSuffix}.json` }],
        ["github"],
      ]
    : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "bun run build && bun run preview --port 4173 --strictPort",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/admin.json" },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts|portal\.spec\.ts/,
    },
    {
      name: "portal",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /portal\.spec\.ts/,
    },
  ],
});
