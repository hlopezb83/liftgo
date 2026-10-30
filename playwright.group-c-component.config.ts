import { defineConfig } from "@playwright/test";
import { browserLaunchOptions, componentOrigin, componentProxyOrigin, evidenceRoot, fakeBackendEnv, repositoryRoot } from "./tests/design-group-c/paths";
export default defineConfig({
  testDir: "./tests/design-group-c/component", testMatch: "*.spec.ts", outputDir: `${evidenceRoot}/component-results`, workers: 1, retries: 0, timeout: 30_000,
  reporter: [["list"]],
  webServer: { command: "node tests/design-group-c/serve-group-c.mjs --components", cwd: repositoryRoot, env: fakeBackendEnv, url: `${componentOrigin}/tests/design-group-c/component/index.html`, reuseExistingServer: false, timeout: 60_000 },
  use: { baseURL: componentOrigin, proxy: { server: componentProxyOrigin, bypass: "<-loopback>" }, serviceWorkers: "block", launchOptions: browserLaunchOptions(componentProxyOrigin) },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
