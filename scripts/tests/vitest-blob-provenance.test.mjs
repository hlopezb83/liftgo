import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareMerge, runIdentity, sealShard } from '../vitest-blob-provenance.mjs';

const identity = runIdentity({ GITHUB_REPOSITORY: 'example/liftgo', GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'a'.repeat(40) });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'liftgo-blob-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const downloads = path.join(root, 'downloads');
  const output = path.join(root, 'verified');
  fs.mkdirSync(downloads);
  fs.mkdirSync(output);
  for (let shard = 1; shard <= 6; shard++) {
    const directory = path.join(downloads, `shard-${shard}`);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'blob.json'), `current run shard ${shard}`);
    sealShard(directory, shard, identity);
  }
  return { root, downloads, output, first: path.join(downloads, 'shard-1') };
}
function rejectsClean(f, pattern) {
  assert.throws(() => prepareMerge(f.downloads, f.output, identity), pattern);
  assert.deepEqual(fs.readdirSync(f.output), [], 'no unverified blob may be staged for Vitest');
}
test('stages exactly six byte-identical current-run blobs, without manifests', t => {
  const f = fixture(t);
  assert.equal(prepareMerge(f.downloads, f.output, identity).length, 6);
  assert.deepEqual(fs.readdirSync(f.output), [1, 2, 3, 4, 5, 6].map(n => `blob-${n}-6.json`));
  for (let shard = 1; shard <= 6; shard++) assert.equal(fs.readFileSync(path.join(f.output, `blob-${shard}-6.json`), 'utf8'), `current run shard ${shard}`);
});
for (const [field, value] of Object.entries({ schema: 2, repository: 'other/repo', runId: '99', runAttempt: '1', commit: 'b'.repeat(40), vitestVersion: 'old', shard: 2, shardCount: 2, blob: '../blob.json', sha256: '0'.repeat(64) })) {
  test(`rejects incorrect provenance: ${field}`, t => {
    const f = fixture(t);
    const filename = path.join(f.first, 'provenance.json');
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    manifest[field] = value;
    fs.writeFileSync(filename, JSON.stringify(manifest));
    rejectsClean(f, /Invalid provenance/);
  });
}
test('rejects a missing shard', t => {
  const f = fixture(t);
  fs.rmSync(f.first, { recursive: true });
  rejectsClean(f, /Unexpected entries/);
});
test('rejects an extra artifact', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.downloads, 'shard-7'));
  rejectsClean(f, /Unexpected entries/);
});
test('rejects a historical or extra blob before merge', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.first, 'blob-2-2.json'), 'historical /dev-server report');
  rejectsClean(f, /Unexpected entries/);
});
test('rejects a blob changed after sealing', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.first, 'blob.json'), 'stale data');
  rejectsClean(f, /Invalid provenance/);
});
test('rejects a missing manifest', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.first, 'provenance.json'));
  rejectsClean(f, /Unexpected entries/);
});
test('refuses a contaminated merge destination without deleting it', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.output, 'blob-2-2.json'), 'historical report');
  assert.throws(() => prepareMerge(f.downloads, f.output, identity), /Unexpected entries/);
  assert.deepEqual(fs.readdirSync(f.output), ['blob-2-2.json']);
});
for (const entry of ['blob.json', 'provenance.json']) {
  test(`rejects symlinked ${entry}`, t => {
    const f = fixture(t);
    const original = path.join(f.first, entry);
    const outside = path.join(f.root, entry);
    fs.renameSync(original, outside);
    fs.symlinkSync(outside, original);
    rejectsClean(f, /regular file/);
  });
}
test('rejects a symlinked shard directory', t => {
  const f = fixture(t);
  const outside = path.join(f.root, 'outside');
  fs.renameSync(f.first, outside);
  fs.symlinkSync(outside, f.first);
  rejectsClean(f, /real directory/);
});
test('seal refuses extra files, an empty report, and invalid shard indexes', t => {
  const f = fixture(t);
  assert.throws(() => sealShard(f.first, 1, identity), /Unexpected entries/);
  fs.rmSync(path.join(f.first, 'provenance.json'));
  fs.writeFileSync(path.join(f.first, 'blob.json'), '');
  assert.throws(() => sealShard(f.first, 1, identity), /Empty/);
  for (const shard of [0, 7, 1.5, NaN]) assert.throws(() => sealShard(f.first, shard, identity), /Invalid shard/);
});
test('fails closed without a complete current GitHub run identity', () => {
  for (const env of [{}, { GITHUB_REPOSITORY: 'example/liftgo', GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '0', GITHUB_SHA: 'a'.repeat(40) }]) assert.throws(() => runIdentity(env), /identity/);
});
test('CLI gate fails on foreign or incomplete input', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/vitest-blob-provenance.mjs', 'merge', f.downloads, f.output], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'example/liftgo', GITHUB_RUN_ID: '101', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: identity.commit } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid provenance/);
  assert.deepEqual(fs.readdirSync(f.output), []);
});
test('checkout ignores generated blobs and retains no tracked report', () => {
  const tracked = spawnSync('git', ['ls-files', '--', '.vitest-reports'], { encoding: 'utf8' });
  assert.equal(tracked.status, 0);
  assert.equal(tracked.stdout.trim(), '');
  const ignored = spawnSync('git', ['check-ignore', '.vitest-reports/blob-1-6.json'], { encoding: 'utf8' });
  assert.equal(ignored.status, 0);
});
test('workflow uses fresh directories, exact artifacts and verification before merge', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /mktemp -d "\$RUNNER_TEMP\/vitest-\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT-shard-/);
  for (let shard = 1; shard <= 6; shard++) assert.ok(workflow.includes(`name: vitest-blob-\${{ github.run_id }}-\${{ github.run_attempt }}-${shard}\n`));
  assert.ok(workflow.indexOf('vitest-blob-provenance.mjs merge') < workflow.indexOf('bunx vitest --merge-reports='));
  assert.match(workflow, /--merge-reports="\$VITEST_MERGE_DIR" --coverage/);
  assert.doesNotMatch(workflow, /path: \.vitest-reports/);
});
