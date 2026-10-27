import { defineConfig } from "@playwright/test";
import { assertGroupCFakeBuild } from "./tests/design-group-c/artifactGuard";
import { appOrigin, browserLaunchOptions, evidenceRoot, fakeBackendEnv, repositoryRoot } from "./tests/design-group-c/paths";

assertGroupCFakeBuild();

export default defineConfig({
  testDir: "./tests/design-group-c", testMatch: ["group-c.spec.ts", "accounts-payable.spec.ts"], outputDir: `${evidenceRoot}/app-results`,
  reporter: [["list"]], workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
  webServer: { command: "node tests/design-group-c/serve-group-c.mjs", cwd: repositoryRoot, env: fakeBackendEnv, url: appOrigin, reuseExistingServer: false, timeout: 60_000 },
  use: { actionTimeout: 10_000, baseURL: appOrigin, serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: browserLaunchOptions },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
