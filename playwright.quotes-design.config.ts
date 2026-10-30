import { defineConfig } from "@playwright/test";
import smoke from "./playwright.smoke.config";
import { FAKE_BACKEND, browserLaunchOptions } from "./scripts/browser-test-config.mjs";

// Importing smoke preserves its local-only origin and fake-build validation.
// This suite never builds automatically: the coordinated build must finish first.
if (process.env.SMOKE_REUSE_BUILD !== "1") {
  throw new Error("[quotes-design] Build with the smoke fake backend first, then set SMOKE_REUSE_BUILD=1.");
}

const baseURL = "http://127.0.0.1:4187";
const proxyURL = "http://127.0.0.1:4188";

export default defineConfig({
  ...smoke,
  testDir: "./tests/quotes-design",
  outputDir: "test-results/quotes-design",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/quotes-design", open: "never" }],
  ],
  webServer: {
    ...smoke.webServer as object,
    command: "node scripts/browser-test-server.mjs",
    env: { ...FAKE_BACKEND, SMOKE_REUSE_BUILD: "1", SMOKE_BASE_URL: baseURL, SMOKE_PROXY_URL: proxyURL },
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    ...smoke.use,
    baseURL,
    proxy: { server: proxyURL, bypass: "<-loopback>" },
    actionTimeout: 10_000,
    launchOptions: browserLaunchOptions(proxyURL, process.env.SMOKE_CHROMIUM_PATH),
  },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
    ...[360, 390].map((width) => ({
      name: `mobile-${width}`,
      use: { viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    })),
  ],
});
