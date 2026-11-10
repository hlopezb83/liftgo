import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const manual = fs.readFileSync('.github/workflows/validaciones-manuales.yml', 'utf8');
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
