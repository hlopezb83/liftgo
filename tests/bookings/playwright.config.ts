import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { FAKE_BACKEND, browserLaunchOptions } from "../../scripts/browser-test-config.mjs";
import smoke from "../../playwright.smoke.config";

// Importing smoke with SMOKE_REUSE_BUILD=1 audits the built artifact for the
// fake backend. Never build implicitly or serve a preexisting local server.
if (process.env.SMOKE_REUSE_BUILD !== "1") throw new Error("Build with the fake backend first and set SMOKE_REUSE_BUILD=1; this config never builds.");
const origin = "http://127.0.0.1:4186";
const proxyURL = "http://127.0.0.1:4189";
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
    command: "node scripts/browser-test-server.mjs",
    env: { ...FAKE_BACKEND, SMOKE_REUSE_BUILD: "1", SMOKE_BASE_URL: origin, SMOKE_PROXY_URL: proxyURL },
    url: origin,
    reuseExistingServer: false,
  },
  use: {
    ...smoke.use,
    baseURL: origin,
    proxy: { server: proxyURL, bypass: "<-loopback>" },
    actionTimeout: 10_000,
    launchOptions: browserLaunchOptions(proxyURL, process.env.SMOKE_CHROMIUM_PATH),
  },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
