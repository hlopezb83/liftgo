import { defineConfig, devices } from "@playwright/test";
import smoke from "./playwright.smoke.config";

// Real production bundle, local-only origin and fake-backend validation.
export default defineConfig({
  ...smoke,
  testDir: "./tests/invoice-ui",
  outputDir: "test-results/invoice-ui",
  reporter: [["list"]],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    ...[360, 390].map((width) => ({
      name: `mobile-${width}`,
      use: { browserName: "chromium" as const, viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    })),
  ],
});
