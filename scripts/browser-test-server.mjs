import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_BACKEND, assertBuildUsesFakeBackend, assertEffectiveBindings, assertLocalBaseURL } from './browser-test-config.mjs';
import { denyWorker, denyOutbound } from './browser-test-egress.mjs';
import { startBrowserProxy } from './browser-test-proxy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildEnvironment(input = process.env) {
  const env = Object.fromEntries(Object.entries(input).filter(([name]) =>
    !/^(?:SUPABASE_|VITE_|SENTRY_|CLOUDFLARE_|CF_|WRANGLER_)/i.test(name)));
  // Preserve the SDK boot regression check, with a separate fake origin so
  // telemetry cannot be mistaken for a mocked Supabase request.
  return { ...env, ...FAKE_BACKEND, VITE_SENTRY_DSN: FAKE_BACKEND.SENTRY_DSN,
    WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', CI: '1' };
}

export async function buildSyntheticApp() {
  console.log(`[browser tests] Build runtime: ${process.version}`);
  const env = buildEnvironment();
  // Preserve package.json prebuild + build, using the verified Node executable
  // directly so a successful Bun invocation cannot stand in for Node coverage.
  for (const args of [['scripts/gen-version.mjs'], ['node_modules/vite/bin/vite.js', 'build']]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Synthetic build failed: ${args[0]} (${signal ?? code})`)));
    });
  }
  assertBuildUsesFakeBackend(root);
}

/** Fail closed on new generated capabilities instead of inheriting remote bindings. */
export function sanitizedBuildConfig(config, directory) {
  const allowed = ['name', 'main', 'compatibility_date', 'compatibility_flags', 'assets', 'no_bundle', 'rules', 'keep_names', '$schema'];
  assert(Object.keys(config).every(key => allowed.includes(key)), 'Unexpected generated Wrangler capability');
  assert.equal(config.no_bundle, true, 'Browser tests must serve the built Worker');
  assert.equal(config.main, 'index.mjs');
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat']);
  assert.equal(config.assets?.binding, 'ASSETS');
  assert(Object.keys(config.assets).every(key => ['binding', 'directory'].includes(key)), 'Unexpected assets capability');
  const assets = path.resolve(directory, config.assets.directory);
  assert.equal(assets, path.join(root, 'dist', 'client'), 'Unexpected assets directory');
  return { ...config, name: 'liftgo-browser-tests', main: path.resolve(directory, config.main),
    assets: { binding: 'ASSETS', directory: assets }, vars: { ...FAKE_BACKEND },
    send_metrics: false };
}

/** Resolve and validate the same effective configuration used by the server. */
export async function resolveWorkerOptions(configFile, envFile, base) {
  assert.equal((await readFile(envFile)).length, 0, 'Browser test env-file must be empty');
  const origin = assertLocalBaseURL(base instanceof URL ? base.origin : base);
  Object.assign(process.env, { WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    WRANGLER_LOG_PATH: path.join(path.dirname(envFile), 'wrangler.log') });
  const { unstable_getMiniflareWorkerOptions, unstable_readConfig } = await import('wrangler');
  // The explicit env file suppresses both .dev.vars and default dotenv lookup.
  const effective = unstable_readConfig({ config: configFile, 'env-file': [envFile] });
  const resolved = unstable_getMiniflareWorkerOptions(effective, undefined, { envFiles: [envFile] });
  assertEffectiveBindings(resolved.workerOptions.bindings);
  assert.equal(resolved.externalWorkers.length, 0, 'Unexpected external Worker');
  assert.deepEqual(resolved.workerOptions.serviceBindings ?? {}, {});
  assert.equal(resolved.workerOptions.connectHandlers.length, 0);
  const require = createRequire(import.meta.url);
  const wranglerRequire = createRequire(require.resolve('wrangler'));
  const { compileModuleRules, convertV4MiniflareOptions, testRegExps } = wranglerRequire('miniflare');
  // Miniflare v5's public converter requires an explicit module manifest.
  // Apply its official legacy-rule compiler before removing modulesRules, so
  // the built Worker's emitted chunks retain the same module types.
  const { modulesRules, ...workerOptions } = resolved.workerOptions;
  const compiledRules = compileModuleRules(modulesRules);
  const modulesRoot = path.dirname(resolved.main);
  const modules = [{ type: 'ESModule', path: resolved.main }];
  const allowedTypes = new Set(['ESModule', 'CommonJS', 'Text', 'Data', 'CompiledWasm']);
  async function collect(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const file = path.resolve(directory, name);
      assert(file.startsWith(`${modulesRoot}${path.sep}`), 'Worker module escaped its build directory');
      const stat = await lstat(file);
      assert(!stat.isSymbolicLink(), 'Worker modules must not contain symlinks');
      if (stat.isDirectory()) await collect(file);
      else if (stat.isFile() && file !== resolved.main) {
        const relative = path.relative(modulesRoot, file).split(path.sep).join('/');
        const rule = compiledRules.find(candidate => testRegExps(candidate.include, relative));
        if (!rule) continue;
        assert(allowedTypes.has(rule.type), 'Unexpected Worker module type');
        assert(!name.startsWith('.env') && !name.startsWith('.dev.vars'), 'Worker module must not load environment files');
        modules.push({ type: rule.type, path: file });
      }
    }
  }
  await collect(modulesRoot);
  const options = convertV4MiniflareOptions({ host: origin.hostname.replaceAll(/[\[\]]/g, ''), port: Number(origin.port),
    cf: false, inspectorPort: 0, workers: [{ ...workerOptions,
      name: 'liftgo-browser-tests', modulesRoot, modules }] });
  assert.equal(options.workers.length, 1);
  const worker = options.workers[0];
  assertEffectiveBindings(Object.fromEntries(Object.entries(worker.config.env).map(([k,v]) => [k,v.type === 'text' ? v.value : v])));
  if (worker.config.env.ASSETS !== undefined) {
    assert.deepEqual(worker.config.env.ASSETS, { type: 'assets' }, 'Unexpected effective assets binding');
  }
  // Global outbound is a Worker with no connect handler / pass-through flag.
  // Unlike a fetcher callback, this also rejects cloudflare:sockets TCP.
  worker.dev = { ...worker.dev, outboundService: denyOutbound };
  options.workers.push(denyWorker);
  return options;
}

export async function runServer() {
  const base = assertLocalBaseURL(process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4173');
  const proxyBase = assertLocalBaseURL(process.env.SMOKE_PROXY_URL ?? 'http://127.0.0.1:4174');
  assert.equal(proxyBase.hostname, '127.0.0.1', 'Browser proxy must bind IPv4 loopback');
  assert.notEqual(base.port, proxyBase.port);
  Object.assign(process.env, { WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' });
  if (process.env.SMOKE_REUSE_BUILD !== '1') {
    await buildSyntheticApp();
  }
  assertBuildUsesFakeBackend(root);
  const directory = path.join(root, 'dist', 'server');
  const raw = JSON.parse(await readFile(path.join(directory, 'wrangler.json'), 'utf8'));
  const config = sanitizedBuildConfig(raw, directory);
  const temporaryRoot = path.join(root, '.wrangler');
  await mkdir(temporaryRoot, { recursive: true });
  const scratch = await mkdtemp(path.join(temporaryRoot, 'browser-tests-'));
  let mf;
  let proxy;
  try {
    const configFile = path.join(scratch, 'wrangler.json');
    const envFile = path.join(scratch, 'empty.env');
    await writeFile(envFile, '');
    await writeFile(configFile, JSON.stringify(config));
    const options = await resolveWorkerOptions(configFile, envFile, base);
    const require = createRequire(import.meta.url);
    const wranglerRequire = createRequire(require.resolve('wrangler'));
    const { Miniflare } = wranglerRequire('miniflare');
    mf = new Miniflare(options);
    await mf.ready;
    proxy = await startBrowserProxy(base.origin, Number(proxyBase.port));
    assert.equal(proxy.url, proxyBase.origin);
    console.log('[browser isolation] PASS: empty env-file; seven effective synthetic bindings; loopback ingress; Worker HTTP/WS/TCP denied; browser proxy restricted to app origin');
    await new Promise(resolve => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  } finally {
    await proxy?.close();
    await mf?.dispose();
    const resolvedScratch = path.resolve(scratch);
    assert(resolvedScratch.startsWith(`${temporaryRoot}${path.sep}browser-tests-`));
    await rm(resolvedScratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.includes('--build-only') ? buildSyntheticApp() : runServer())
    .catch(error => { console.error(error); process.exitCode = 1; });
}
