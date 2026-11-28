import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const manual = fs.readFileSync('.github/workflows/validaciones-manuales.yml', 'utf8');
test('overdue transport changes run the PostgreSQL contract before required CI passes', () => {
  const filters = ci.split('            sql_contracts:\n')[1].split('            quote_paging:')[0];
  for (const path of ['scripts/tests/overdue-deliveries.postgres.mjs', 'src/features/deliveries/lib/overdueDeliveriesPageRpc.ts',
    'src/features/deliveries/hooks/useOverdueDeliveriesPage.ts', 'src/features/deliveries/pages/OverdueDeliveriesPage.tsx',
    'src/features/deliveries/pages/DeliveriesPage.tsx', 'src/features/dashboard/components/AlertsRow.tsx', '.github/workflows/ci.yml']) {
    assert.ok(filters.includes(`- ${path}`), path);
  }
  assert.match(ci, /node scripts\/tests\/dashboard-search.postgres.mjs\n\s+node scripts\/tests\/overdue-deliveries.postgres.mjs/);
});
test('automatic CI cannot silently skip unit tests or accept their failures', () => {
  assert.match(ci, /node node_modules\/vitest\/vitest.mjs run --shard=/);
  assert.doesNotMatch(ci, /--changed|--passWithNoTests|continue-on-error: true|paths-ignore:/);
  assert.doesNotMatch(ci, /VITEST_SHARD_BLOB|--coverage/);
});
test('manual validations cannot run on a repository event or select databases by default', () => {
  const events = manual.split('\non:\n')[1].split('\npermissions:')[0];
  assert.match(events, /workflow_dispatch:/);
  assert.match(events, /default: browser/);
  assert.doesNotMatch(events, /pull_request:|push:|schedule:|workflow_run:/);
});
test('CI uses no production secrets and keeps its real isolated Worker smoke', () => {
  assert.doesNotMatch(ci, /secrets\.(?!GITHUB_TOKEN)|pull_request_target|contents: write/);
  assert.ok(ci.includes('node scripts/browser-test-server.mjs --build-only'));
  assert.ok(ci.includes('playwright.smoke.config.ts'));
  assert.ok(ci.includes('SMOKE_REUSE_BUILD: "1"'));
  for (const source of [ci, manual]) {
    assert.doesNotMatch(source, /uses: \.\/\.github\/actions\//);
    for (const use of source.matchAll(/uses: (\S+)/g)) assert.match(use[1], /@[0-9a-f]{40}$/);
  }
});
test('CI preserves main runs, enforces knip/changelog, uses resilient caches, and balances manual coverage', () => {
  assert.match(ci, /cancel-in-progress:\s*\$\{\{\s*github\.ref != 'refs\/heads\/main'\s*\}\}/);
  assert.match(ci, /--concurrency auto/);
  assert.match(ci, /bun run knip/);
  assert.match(ci, /bun run changelog:check/);
  assert.match(ci, /Caché de Deno/);
  assert.match(manual, /VITEST_CI_BALANCED:\s*"1"/);
  assert.doesNotMatch(manual, /Excluir archivos de entorno locales/);
  assert.doesNotMatch(manual, /apt-get install -y postgresql-16/);
  for (const source of [ci, manual]) {
    assert.doesNotMatch(source, /chromium-v2-\$\{\{\s*hashFiles\('bun\.lock'\)\s*\}\}/);
    const bunCaches = source.match(/path: ~\/\.bun\/install\/cache/g) ?? [];
    const bunRestores = source.match(/\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-bun-v2-\n/g) ?? [];
    assert.equal(bunRestores.length, bunCaches.length, 'every Bun package cache must declare restore-keys');
  }
});
