import { resolve } from "node:path";
import { FAKE_BACKEND, browserLaunchOptions as isolatedBrowserLaunchOptions } from "../../scripts/browser-test-config.mjs";

// Run the harness from the repository root. Overrides may be absolute or
// relative to that root; no dotenv loader participates in path resolution.
export const repositoryRoot = resolve(".");
export const buildRoot = resolve(repositoryRoot, process.env.GROUP_C_BUILD_DIR ?? ".");
export const evidenceRoot = resolve(repositoryRoot, process.env.GROUP_C_EVIDENCE_DIR ?? "test-results/group-c");
export const compiledRoot = resolve(buildRoot, "dist/server/_ssr");
export const wranglerConfig = resolve(buildRoot, "dist/server/wrangler.json");
export const appOrigin = "http://127.0.0.1:4195";
export const componentOrigin = "http://127.0.0.1:4194";
export const appProxyOrigin = "http://127.0.0.1:4196";
export const componentProxyOrigin = "http://127.0.0.1:4197";

export const fakeBackendEnv: Record<string, string> = {
  ...FAKE_BACKEND,
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
};

export const browserLaunchOptions = (proxyURL: string) =>
  isolatedBrowserLaunchOptions(proxyURL, process.env.SMOKE_CHROMIUM_PATH);
