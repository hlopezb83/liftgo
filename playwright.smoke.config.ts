import { defineConfig, devices } from "@playwright/test";
import { FAKE_BACKEND, assertBuildUsesFakeBackend, assertLocalBaseURL, browserLaunchOptions } from "./scripts/browser-test-config.mjs";
import { PRODUCTION_PROJECT_REFS } from "./tests/e2e/fixtures/productionGuard";

// All three synthetic browser suites share the same fail-closed harness.
const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173";
const proxyURL = process.env.SMOKE_PROXY_URL ?? "http://127.0.0.1:4174";
assertLocalBaseURL(baseURL);
assertLocalBaseURL(proxyURL);
if (process.env.SMOKE_REUSE_BUILD === "1") assertBuildUsesFakeBackend(process.cwd(), PRODUCTION_PROJECT_REFS);
export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL,
    // Chromium sends even loopback traffic through the origin allowlist proxy.
    proxy: { server: proxyURL, bypass: "<-loopback>" },
    // Browser-level policy also covers tests which create their own contexts.
    launchOptions: browserLaunchOptions(proxyURL, process.env.SMOKE_CHROMIUM_PATH),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Un service worker cacheado enmascararía errores de arranque del bundle.
    serviceWorkers: "block",
  },
  webServer: {
    command: "node scripts/browser-test-server.mjs",
    url: baseURL,
    timeout: 180_000,
    // Nunca reutilizar un servidor ajeno: podría estar sirviendo un build
    // compilado contra el backend real.
    reuseExistingServer: false,
    // Se inyecta al build Y al servidor.
    env: { ...FAKE_BACKEND },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
