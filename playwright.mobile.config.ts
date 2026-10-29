import { defineConfig } from "@playwright/test";
import smoke from "./playwright.smoke.config";

// Inherits fake-backend build validation and local-only origin guard.
export default defineConfig({
  ...smoke,
  testDir: "./tests/mobile",
  outputDir: "test-results/mobile",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/mobile", open: "never" }],
  ],
  projects: [360, 390].map((width) => ({
    name: `mobile-${width}`,
    use: {
      browserName: "chromium",
      viewport: { width, height: 800 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    },
  })),
});
