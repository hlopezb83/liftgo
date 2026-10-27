import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import smoke from "../../playwright.smoke.config";

// Importing smoke with SMOKE_REUSE_BUILD=1 audits the built artifact for the
// fake backend. Never build implicitly or serve a preexisting local server.
if (process.env.SMOKE_REUSE_BUILD !== "1") throw new Error("Build with the fake backend first and set SMOKE_REUSE_BUILD=1; this config never builds.");
const origin = "http://127.0.0.1:4186";
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  ...smoke,
  testDir: ".",
  outputDir: "../../test-results/bookings",
  reporter: [["list"]],
  workers: 1,
  timeout: 60_000,
  webServer: {
    ...smoke.webServer as object,
    cwd: repositoryRoot,
    command: "node node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 4186 --var SENTRY_DSN:http://public@127.0.0.1:54321/1",
    url: origin,
    reuseExistingServer: false,
  },
  use: {
    ...smoke.use,
    baseURL: origin,
    actionTimeout: 10_000,
    launchOptions: process.env.SMOKE_CHROMIUM_PATH ? { executablePath: process.env.SMOKE_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
