import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import smoke from "../../playwright.smoke.config";

// Real application build, synthetic bindings and the shared network denylist.
export default defineConfig({
  ...smoke,
  testDir: ".",
  testMatch: "dashboard-priority.spec.ts",
  outputDir: "../../test-results/dashboard",
  reporter: [["list"]],
  webServer: { ...smoke.webServer as object, command: "node scripts/browser-test-server.mjs", url: process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173", cwd: fileURLToPath(new URL("../../", import.meta.url)) },
  projects: [
    { name: "dashboard-320", use: { browserName: "chromium", viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "dashboard-390", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "dashboard-desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
  ],
});
