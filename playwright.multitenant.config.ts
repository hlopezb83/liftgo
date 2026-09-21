import { defineConfig, devices } from "@playwright/test";

/**
 * Gate multiempresa A/B (datos + Storage API + portal en navegador).
 *
 * Separado a propósito de `playwright.config.ts`: las E2E históricas usan
 * cuentas externas y un seed distinto. Esta suite SOLO corre contra el
 * Supabase LOCAL efímero del runner y aborta fail-closed si detecta cualquier
 * destino remoto o el ref productivo (ver tests/multi-tenant-ab/fixtures/
 * localBackend.ts, que endurece tests/e2e/fixtures/productionGuard.ts).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./tests/multi-tenant-ab",
  globalSetup: "./tests/multi-tenant-ab/global.setup.ts",
  globalTeardown: "./tests/multi-tenant-ab/global.teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Un solo worker: las dos organizaciones comparten un seed determinista.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-multitenant", open: "never" }],
    ["junit", { outputFile: "reports/multitenant-ab-junit.xml" }],
    ["json", { outputFile: "reports/multitenant-ab.json" }],
    ["./tests/multi-tenant-ab/abMatrixReporter.ts"],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: process.env.E2E_REUSE_BUILD ? "bun run preview" : "bun run build && bun run preview",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
