import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FAKE_BACKEND, assertEffectiveBindings } from "../browser-test-config.mjs";
import { buildEnvironment, sanitizedBuildConfig } from "../browser-test-server.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, "dist", "server");
const generated = () => ({
  name: "liftgo",
  compatibility_date: "2026-09-07",
  compatibility_flags: ["nodejs_compat"],
  main: "index.mjs",
  assets: { directory: "../client", binding: "ASSETS" },
  keep_names: false,
  no_bundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.mjs", "**/*.js"] }],
});

test("build environment replaces backend and monitoring values, drops remote credentials", () => {
  const env = buildEnvironment({
    PATH: "synthetic-tool-path",
    SUPABASE_URL: "http://synthetic.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-other-key",
    VITE_SUPABASE_URL: "http://synthetic.invalid",
    VITE_OTHER: "synthetic-other-setting",
    VITE_SENTRY_DSN: "http://synthetic.invalid/1",
    SENTRY_AUTH_TOKEN: "synthetic-token-that-must-not-pass",
    SENTRY_ORG: "synthetic-org",
    CLOUDFLARE_API_TOKEN: "synthetic-token-that-must-not-pass",
    CF_API_KEY: "synthetic-token-that-must-not-pass",
    WRANGLER_ENV: "synthetic-remote-environment",
    WRANGLER_SEND_METRICS: "true",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  });
  assert.equal(env.PATH, "synthetic-tool-path");
  for (const [name, value] of Object.entries(FAKE_BACKEND)) assert.equal(env[name], value, name);
  assert.equal(env.VITE_SENTRY_DSN, FAKE_BACKEND.SENTRY_DSN);
  assert.notEqual(new URL(env.VITE_SENTRY_DSN).origin, new URL(env.VITE_SUPABASE_URL).origin);
  assert.equal(new URL(env.VITE_SENTRY_DSN).hostname, "127.0.0.1");
  assert.equal(env.CI, "1");
  assert.equal(env.WRANGLER_SEND_METRICS, "false");
  assert.equal(env.CLOUDFLARE_INCLUDE_PROCESS_ENV, "false");
  for (const name of ["VITE_OTHER", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "CLOUDFLARE_API_TOKEN", "CF_API_KEY", "WRANGLER_ENV"]) {
    assert.equal(Object.hasOwn(env, name), false, name);
  }
});

test("generated build config keeps only the local build and explicit synthetic vars", () => {
  const original = generated();
  const sanitized = sanitizedBuildConfig(original, directory);
  assert.equal(sanitized.name, "liftgo-browser-tests");
  assert.equal(sanitized.main, path.join(directory, "index.mjs"));
  assert.deepEqual(sanitized.assets, { binding: "ASSETS", directory: path.join(root, "dist", "client") });
  assert.equal(sanitized.send_metrics, false);
  assertEffectiveBindings(sanitized.vars);
  assert.equal(original.main, "index.mjs", "input config must not be mutated");
  assert.equal(Object.hasOwn(original, "vars"), false);
});

test("generated config refuses remote services, bindings and unexplained capabilities", () => {
  for (const [name, value] of Object.entries({
    services: [{ binding: "API", service: "synthetic-remote", remote: true }],
    kv_namespaces: [{ binding: "KV", id: "synthetic-id", remote: true }],
    r2_buckets: [{ binding: "R2", bucket_name: "synthetic-bucket", remote: true }],
    vars: { SUPABASE_URL: "http://synthetic.invalid" },
    dev: { remote: true },
    unsafe: { bindings: [{ name: "REMOTE", type: "service", service: "synthetic" }] },
  })) {
    assert.throws(() => sanitizedBuildConfig({ ...generated(), [name]: value }, directory), /Unexpected generated Wrangler capability/, name);
  }
});

test("generated config rejects changed worker entry, flags and asset capabilities", () => {
  assert.throws(() => sanitizedBuildConfig({ ...generated(), main: "../outside.mjs" }, directory));
  assert.throws(() => sanitizedBuildConfig({ ...generated(), no_bundle: false }, directory));
  assert.throws(() => sanitizedBuildConfig({ ...generated(), compatibility_flags: ["nodejs_compat", "connect_pass_through"] }, directory));
  assert.throws(() => sanitizedBuildConfig({ ...generated(), assets: { directory: "../outside", binding: "ASSETS" } }, directory), /Unexpected assets directory/);
  assert.throws(() => sanitizedBuildConfig({ ...generated(), assets: { directory: "../client", binding: "OTHER" } }, directory));
  assert.throws(() => sanitizedBuildConfig({ ...generated(), assets: { directory: "../client", binding: "ASSETS", run_worker_first: true } }, directory), /Unexpected assets capability/);
});
