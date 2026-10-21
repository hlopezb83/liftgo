import { defineConfig, devices } from "@playwright/test";
import { PUBLISHED_APP_ORIGIN } from "./tests/smoke/readOnlyPolicy";

/** Public UI only. Never inherit auth setup, teardown, storage, or a webServer. */
export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: "app-boot.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: "test-results/prod-smoke",
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  metadata: { publishedSmoke: true },
  use: {
    baseURL: PUBLISHED_APP_ORIGIN,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: false,
  },
  projects: [{ name: "public-chromium", use: { ...devices["Desktop Chrome"] } }],
});
