import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FAKE_BACKEND, assertEffectiveBindings } from "../browser-test-config.mjs";
import { denyOutbound, DENY_WORKER_NAME } from "../browser-test-egress.mjs";
import { resolveWorkerOptions } from "../browser-test-server.mjs";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { Miniflare } = wranglerRequire("miniflare");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("real Wrangler resolution ignores contaminated dotenv and process env; preflight rejects bad effective bindings", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "liftgo-browser-runtime-"));
  const configFile = path.join(directory, "wrangler.json");
  const envFile = path.join(directory, "empty.env");
  const savedEnv = Object.fromEntries([...Object.keys(FAKE_BACKEND), "EXTRA_SYNTHETIC_BINDING", "CLOUDFLARE_INCLUDE_PROCESS_ENV", "WRANGLER_SEND_METRICS", "WRANGLER_LOG_PATH"]
    .map((name) => [name, process.env[name]]));
  let mf;
  try {
    const pollution = Object.fromEntries(Object.keys(FAKE_BACKEND).map((name) => [name,
      name.endsWith("URL") || name === "SENTRY_DSN" ? "http://synthetic.invalid:54321" : "synthetic-inherited-value"]));
    pollution.EXTRA_SYNTHETIC_BINDING = "synthetic-inherited-value";
    const dotenv = Object.entries(pollution).map(([name, value]) => `${name}=${value}`).join("\n");
    await writeFile(path.join(directory, ".env"), dotenv);
    await writeFile(path.join(directory, ".dev.vars"), dotenv);
    Object.assign(process.env, pollution, { CLOUDFLARE_INCLUDE_PROCESS_ENV: "true" });
    await writeFile(envFile, "");
    await writeFile(path.join(directory, "index.mjs"), "import { syntheticResponse } from './chunk.mjs'; export default { fetch(_request, env) { return syntheticResponse(env); } };\n");
    await writeFile(path.join(directory, "chunk.mjs"), "export function syntheticResponse(env) { return Response.json(env); }\n");
    const config = {
      name: "synthetic-preflight",
      main: "index.mjs",
      compatibility_date: "2026-08-01",
      compatibility_flags: ["nodejs_compat"],
      no_bundle: true,
      rules: [{ type: "ESModule", globs: ["**/*.mjs", "**/*.js"] }],
      vars: { ...FAKE_BACKEND },
      send_metrics: false,
    };
    const base = new URL(`http://127.0.0.1:${await freePort()}`);
    await writeFile(configFile, JSON.stringify(config));
    const options = await resolveWorkerOptions(configFile, envFile, base);
    assert.equal((await readFile(envFile)).length, 0);
    assert.equal(process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV, "false");
    assert.equal(options.host, "127.0.0.1");
    assert.equal(options.workers.length, 2);
    assert.deepEqual(options.workers[0].dev.outboundService, denyOutbound);
    assert.equal(options.workers[1].config.name, DENY_WORKER_NAME);
    assert.deepEqual(Object.keys(options.workers[0].config.manifest.modules), ["index.mjs", "chunk.mjs"]);
    const configured = Object.fromEntries(Object.entries(options.workers[0].config.env).map(([name, value]) => [name, value.value]));
    assertEffectiveBindings(configured);

    await t.test("the Worker sees exactly the seven synthetic values after effective resolution", async () => {
      mf = new Miniflare(options);
      await mf.ready;
      const response = await mf.dispatchFetch(`${base.origin}/synthetic-bindings`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), FAKE_BACKEND);
      await mf.dispose();
      mf = undefined;
    });

    await t.test("poisoned, missing and extra bindings fail before a runtime is constructed", async () => {
      const missing = { ...FAKE_BACKEND };
      delete missing.SUPABASE_SERVICE_ROLE_KEY;
      for (const vars of [
        { ...FAKE_BACKEND, SUPABASE_URL: "http://synthetic.invalid:54321" },
        missing,
        { ...FAKE_BACKEND, EXTRA_SYNTHETIC_BINDING: "synthetic-explicit-value" },
        { ...FAKE_BACKEND, ASSETS: "synthetic-nonassets-binding" },
      ]) {
        await writeFile(configFile, JSON.stringify({ ...config, vars }));
        await assert.rejects(resolveWorkerOptions(configFile, envFile, base), /Effective binding differs|Unexpected effective binding|Unexpected effective assets binding/);
      }
    });

    await t.test("a nonempty env-file is rejected before reading Wrangler configuration", async () => {
      await writeFile(envFile, "SUPABASE_URL=http://synthetic.invalid:54321\n");
      await assert.rejects(resolveWorkerOptions(configFile, envFile, base), /env-file must be empty/);
    });
  } finally {
    await mf?.dispose();
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert(path.basename(resolved).startsWith("liftgo-browser-runtime-"));
    await rm(resolved, { recursive: true, force: true });
  }
});
