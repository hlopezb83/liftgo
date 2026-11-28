import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'vite';
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';

test('Sentry stamps matching debug IDs into hidden source maps without uploads', async () => {
  // Never inherit credentials, DSNs or release settings from a developer shell.
  const sentryEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^SENTRY_/i.test(name)));
  for (const name of Object.keys(sentryEnv)) delete process.env[name];
  const root = await mkdtemp(path.join(os.tmpdir(), 'liftgo-sentry-offline-'));
  try {
    await writeFile(path.join(root, 'entry.js'), 'globalThis.__syntheticSentryQa = "offline-demo";\n');
    await build({
      configFile: false,
      root,
      logLevel: 'warn',
      plugins: [sentryVitePlugin({
        telemetry: false,
        release: { name: 'liftgo@qa-offline', create: false, finalize: false },
        sourcemaps: { disable: 'disable-upload' },
      })],
      build: { sourcemap: 'hidden', minify: true, lib: { entry: path.join(root, 'entry.js'), formats: ['es'], fileName: 'qa' } },
    });
    const files = await readdir(path.join(root, 'dist'));
    const jsName = files.find(name => name.endsWith('.js') || name.endsWith('.mjs'));
    assert.ok(jsName);
    const js = await readFile(path.join(root, 'dist', jsName), 'utf8');
    const map = JSON.parse(await readFile(path.join(root, 'dist', `${jsName}.map`), 'utf8'));
    assert.match(map.debug_id, /^[0-9a-f-]{36}$/);
    assert.ok(js.includes(map.debug_id));
    assert.ok(js.includes('liftgo@qa-offline'));
    assert.ok(map.sourcesContent.some(source => source.includes('offline-demo')));
    assert.ok(!js.includes('sourceMappingURL='));
  } finally {
    try {
      await rm(root, { recursive: true, force: true });
    } finally {
      Object.assign(process.env, sentryEnv);
    }
  }
});

test('Sentry sourcemaps, environment separation, and Edge release contracts stay wired', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '..', '..');
  const viteConfig = await readFile(path.join(repoRoot, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /sourcemap:\s*process\.env\.SENTRY_AUTH_TOKEN\s*\?\s*"hidden"\s*:\s*false/);
  assert.match(viteConfig, /filesToDeleteAfterUpload:\s*"\.\/dist\/\*\*\/\*\.map"/);

  const clientSentry = await readFile(path.join(repoRoot, 'src/lib/observability/sentry.ts'), 'utf8');
  assert.match(clientSentry, /VITE_SENTRY_ENVIRONMENT/);
  assert.match(clientSentry, /\/api\/sentry-tunnel/);

  const serverSentry = await readFile(path.join(repoRoot, 'src/lib/observability/serverSentry.server.ts'), 'utf8');
  assert.match(serverSentry, /SENTRY_ENVIRONMENT/);

  const edgeSentry = await readFile(path.join(repoRoot, 'supabase/functions/_shared/edgeSentry.ts'), 'utf8');
  assert.match(edgeSentry, /SENTRY_ENVIRONMENT/);
  assert.match(edgeSentry, /SENTRY_RELEASE/);
  assert.doesNotMatch(edgeSentry, /liftgo-cloud@2026-10-03/);
});
