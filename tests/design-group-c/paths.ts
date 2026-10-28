import { resolve } from "node:path";

// Run the harness from the repository root. Overrides may be absolute or
// relative to that root; no dotenv loader participates in path resolution.
export const repositoryRoot = resolve(".");
export const buildRoot = resolve(repositoryRoot, process.env.GROUP_C_BUILD_DIR ?? ".");
export const evidenceRoot = resolve(repositoryRoot, process.env.GROUP_C_EVIDENCE_DIR ?? "test-results/group-c");
export const compiledRoot = resolve(buildRoot, "dist/server/_ssr");
export const wranglerConfig = resolve(buildRoot, "dist/server/wrangler.json");
export const appOrigin = "http://127.0.0.1:4195";
export const componentOrigin = "http://127.0.0.1:4194";

export const fakeBackendEnv = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_PUBLISHABLE_KEY: "smoke-placeholder-key",
  VITE_SUPABASE_PROJECT_ID: "smoke-placeholder",
  SENTRY_DSN: "http://public@127.0.0.1:54321/1",
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
};

export const browserLaunchOptions = process.env.SMOKE_CHROMIUM_PATH
  ? { executablePath: process.env.SMOKE_CHROMIUM_PATH }
  : {};
