import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { assertGroupCFakeBuild } from "./artifactGuard.ts";
import { evidenceRoot, fakeBackendEnv, repositoryRoot, wranglerConfig } from "./paths.ts";

assertGroupCFakeBuild();
const args = [
  resolve(repositoryRoot, "node_modules/wrangler/bin/wrangler.js"),
  "dev", "--local", "--config", wranglerConfig,
  "--env-file", resolve(repositoryRoot, "tests/design-group-c/fixture-env.txt"),
  "--ip", "127.0.0.1", "--port", "4195",
];
for (const [key, value] of Object.entries(fakeBackendEnv)) {
  if (!key.startsWith("WRANGLER_") && !key.startsWith("CLOUDFLARE_")) args.push("--var", `${key}:${value}`);
}
const child = spawn(process.execPath, args, {
  cwd: repositoryRoot,
  env: {
    ...process.env, ...fakeBackendEnv,
    SENTRY_AUTH_TOKEN: "", CLOUDFLARE_API_TOKEN: "", SUPABASE_SERVICE_ROLE_KEY: "",
    WRANGLER_LOG_PATH: resolve(evidenceRoot, "wrangler-logs"),
    XDG_CONFIG_HOME: resolve(evidenceRoot, "runtime-config"),
    XDG_CACHE_HOME: resolve(evidenceRoot, "runtime-cache"),
  },
  shell: false,
  stdio: "inherit",
});
child.once("error", error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
