import { defineConfig } from "@playwright/test";
import { browserLaunchOptions, FAKE_BACKEND } from "./scripts/browser-test-config.mjs";

export default defineConfig({
  testDir: "./tests/historical-deliveries-browser", testMatch: "*.spec.ts", workers: 1, retries: 0, timeout: 30_000,
  outputDir: "test-results/historical-deliveries",
  reporter: [["list"], ["json", { outputFile: "reports/historical-deliveries-browser.json" }]],
  webServer: { command: "node tests/historical-deliveries-browser/serve.mjs", env: FAKE_BACKEND, url: "http://127.0.0.1:4218/tests/historical-deliveries-browser/index.html", reuseExistingServer: false, timeout: 60_000 },
  use: { baseURL: "http://127.0.0.1:4218", proxy: { server: "http://127.0.0.1:4219", bypass: "<-loopback>" }, serviceWorkers: "block", launchOptions: browserLaunchOptions("http://127.0.0.1:4219", process.env.SMOKE_CHROMIUM_PATH) },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
