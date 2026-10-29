import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BootstrapBlocked, cleanupBootstrap, prepareBootstrap, replayBootstrap, startSafeBootstrap } from '../ci-ephemeral-bootstrap.mjs';
import { canonicalReplayManifest } from '../ci-drizzle-replay.mjs';

const CONFIG = 'project_id = "offline_fixture"\n\n[functions.fixture]\nverify_jwt = true\n';
const HISTORY = '-- An inert source file for hashing tests. Never executed.\n';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const REPO = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const DRIZZLE_SOURCE = join(REPO, 'drizzle/migrations');
const DRIZZLE_SQL_NAMES = readdirSync(DRIZZLE_SOURCE).filter(name => name.endsWith('.sql')).sort();

function copyCanonicalDrizzle(workspace) {
  const directory = join(workspace, 'drizzle/migrations');
  mkdirSync(join(directory, 'meta'), { recursive: true });
  // Copy the current canonical bytes. Tests never execute them or alter their originals.
  for (const name of DRIZZLE_SQL_NAMES) copyFileSync(join(DRIZZLE_SOURCE, name), join(directory, name));
  copyFileSync(join(DRIZZLE_SOURCE, 'meta/_journal.json'), join(directory, 'meta/_journal.json'));
}

function fixture(t, profile = 'rls') {
  const folder = mkdtempSync(join(tmpdir(), 'liftgo-bootstrap-core-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const workspace = join(folder, 'workspace'), runnerTemp = join(folder, 'runner');
  mkdirSync(join(workspace, 'supabase/migrations'), { recursive: true });
  mkdirSync(runnerTemp);
  writeFileSync(join(workspace, 'supabase/config.toml'), CONFIG);
  writeFileSync(join(workspace, 'supabase/migrations/20260101000000_fixture.sql'), HISTORY);
  copyCanonicalDrizzle(workspace);
  const binding = { sha: 'a'.repeat(40), runId: '91001', attempt: '1', job: 'offline_contract', profile,
    nonce: '11111111-1111-4111-8111-111111111111' };
  const options = { binding, workspace, runnerTemp };
  return { folder, workspace, runnerTemp, binding, options };
}
function prepared(t, profile) {
  const value = fixture(t, profile), report = prepareBootstrap(value.options);
  return { ...value, report, directory: dirname(report.state_path) };
}
function mutateMarker(value, mutate) {
  const state = JSON.parse(readFileSync(value.report.state_path, 'utf8'));
  mutate(state);
  writeFileSync(value.report.state_path, JSON.stringify(state) + '\n');
}
function assertRuntimeBlocked(operation, options) {
  assert.throws(() => operation(options), error => error instanceof BootstrapBlocked
    && error.code === 'PRESTART_CONTAINMENT_UNIMPLEMENTED');
}
function assertContractRejected(operation, options) {
  assert.throws(() => operation(options), error => !(error instanceof BootstrapBlocked));
}

test('preparation creates private snapshots without changing config or history or authorizing runtime', t => {
  const value = prepared(t);
  assert.equal(value.report.kind, 'local-preparation');
  assert.equal(value.report.status, 'PREPARED_RUNTIME_BLOCKED');
  assert.equal(value.report.real_execution, false);
  assert.equal(value.report.replay_authorized, false);
  assert.equal(readFileSync(join(value.workspace, 'supabase/config.toml'), 'utf8'), CONFIG);
  assert.equal(readFileSync(join(value.workspace, 'supabase/migrations/20260101000000_fixture.sql'), 'utf8'), HISTORY);
  for (const name of [...DRIZZLE_SQL_NAMES, 'meta/_journal.json']) {
    assert.deepEqual(readFileSync(join(value.workspace, 'drizzle/migrations', name)), readFileSync(join(DRIZZLE_SOURCE, name)));
  }
  assert.deepEqual(readdirSync(value.directory).sort(), ['bootstrap.toml', 'ownership.json', 'replay.toml', 'source.toml']);
  assert.equal(lstatSync(value.directory).mode & 0o777, 0o700);
  for (const name of readdirSync(value.directory)) assert.equal(lstatSync(join(value.directory, name)).mode & 0o777, 0o600);
  assert.match(readFileSync(join(value.directory, 'bootstrap.toml'), 'utf8'), /\[db\.migrations\]\nenabled = false/);
  assert.match(readFileSync(join(value.directory, 'bootstrap.toml'), 'utf8'), /\[db\.seed\]\nenabled = false/);
  assert.doesNotMatch(readFileSync(join(value.directory, 'replay.toml'), 'utf8'), /\[db\.migrations\]/);
});

test('invalid UTF-8 in a config comment is rejected before creating any ownership state', t => {
  const value = fixture(t), source = join(value.workspace, 'supabase/config.toml');
  const bytes = Buffer.concat([Buffer.from(CONFIG + '\n# invalid comment: '), Buffer.from([0xff]), Buffer.from('\n')]);
  writeFileSync(source, bytes);
  assert.throws(() => prepareBootstrap(value.options), TypeError);
  assert.deepEqual(readdirSync(value.runnerTemp), []);
  assert.deepEqual(readFileSync(source), bytes);
  assert.equal(readFileSync(join(value.workspace, 'supabase/migrations/20260101000000_fixture.sql'), 'utf8'), HISTORY);
});

test('valid UTF-8 comments preserve the exact original source bytes in the private snapshot', t => {
  const value = fixture(t), source = join(value.workspace, 'supabase/config.toml');
  const bytes = Buffer.from(CONFIG + '\n# comprobación: á, 漢字, 🧪\n', 'utf8');
  writeFileSync(source, bytes);
  const report = prepareBootstrap(value.options);
  assert.deepEqual(readFileSync(join(dirname(report.state_path), 'source.toml')), bytes);
  assert.deepEqual(readFileSync(source), bytes);
  assert.equal(report.real_execution, false);
  assert.equal(report.replay_authorized, false);
});

test('reusing an active exact session fails without overwriting its first ownership claim', t => {
  const value = prepared(t), original = readFileSync(value.report.state_path);
  assert.throws(() => prepareBootstrap(value.options));
  assert.deepEqual(readFileSync(value.report.state_path), original);
});

test('profile, job, nonce, run, attempt and SHA each produce a distinct preparation identity', t => {
  const value = fixture(t), choices = [value.binding,
    { ...value.binding, profile: 'ab' }, { ...value.binding, job: 'another_job' },
    { ...value.binding, nonce: '22222222-2222-4222-8222-222222222222' },
    { ...value.binding, runId: '91002' }, { ...value.binding, attempt: '2' },
    { ...value.binding, sha: 'b'.repeat(40) }];
  const summaries = choices.map(binding => prepareBootstrap({ ...value.options, binding }));
  assert.equal(new Set(summaries.map(summary => summary.state_path)).size, choices.length);
  assert.equal(new Set(summaries.map(summary => summary.project_id)).size, choices.length);
});

test('start and replay remain blocked even with a fabricated real measurement or passed trial attached', t => {
  const value = prepared(t), options = { ...value.options,
    evidence: { kind: 'real', status: 'TRIAL_PASS', replay_authorized: true },
    guard: { dns_deny: true, includesFutureAuxiliaries: true }, run: () => assert.fail('No runtime command is permitted') };
  assertRuntimeBlocked(startSafeBootstrap, options);
  assertRuntimeBlocked(replayBootstrap, options);
  assert.equal(JSON.parse(readFileSync(value.report.state_path)).phase, 'prepared');
});

test('changed migration bytes are rejected before the runtime boundary', t => {
  const value = prepared(t);
  writeFileSync(join(value.workspace, 'supabase/migrations/20260101000000_fixture.sql'), HISTORY + '-- changed\n');
  assertContractRejected(startSafeBootstrap, value.options);
  assertContractRejected(replayBootstrap, value.options);
});

test('new or removed source files cannot reuse a prepared manifest', t => {
  const value = prepared(t), source = join(value.workspace, 'supabase/migrations/20260102000000_added.sql');
  writeFileSync(source, '-- Additional inert source, never executed.\n');
  assertContractRejected(startSafeBootstrap, value.options);
  unlinkSync(source);
  unlinkSync(join(value.workspace, 'supabase/migrations/20260101000000_fixture.sql'));
  assertContractRejected(startSafeBootstrap, value.options);
});

test('changed canonical config cannot reuse a prepared baseline', t => {
  const value = prepared(t);
  writeFileSync(join(value.workspace, 'supabase/config.toml'), CONFIG.replace('verify_jwt = true', 'verify_jwt = false'));
  assertContractRejected(startSafeBootstrap, value.options);
});

test('changed phase config cannot enable history or seed', t => {
  const value = prepared(t);
  const config = join(value.directory, 'bootstrap.toml');
  writeFileSync(config, readFileSync(config, 'utf8').replaceAll('enabled = false', 'enabled = true'));
  assertContractRejected(startSafeBootstrap, value.options);
  assertContractRejected(cleanupBootstrap, value.options);
});

test('rehashing a modified plan does not bypass canonical config reconstruction', t => {
  const value = prepared(t);
  mutateMarker(value, state => {
    state.plan.configs.bootstrap = state.plan.configs.bootstrap.replace('enabled = false', 'enabled = true');
    state.planDigest = hash(state.plan);
  });
  assertContractRejected(startSafeBootstrap, value.options);
});

for (const [label, mutate] of [
  ['foreign binding', state => { state.binding.sha = 'b'.repeat(40); }],
  ['runtime kind', state => { state.kind = 'real'; }],
  ['advanced phase', state => { state.phase = 'replayed'; }],
  ['invented resources', state => { state.resources.containers = ['unowned-container']; }],
  ['foreign workspace', state => { state.workspace += '-other'; }],
]) {
  test('ownership rejects ' + label + ' before starting or cleaning anything', t => {
    const value = prepared(t);
    mutateMarker(value, mutate);
    assertContractRejected(startSafeBootstrap, value.options);
    assertContractRejected(cleanupBootstrap, value.options);
    assert.ok(existsSync(value.directory));
  });
}

test('group-readable ownership or group-accessible session directories are rejected', t => {
  const value = prepared(t);
  chmodSync(value.report.state_path, 0o640);
  assertContractRejected(startSafeBootstrap, value.options);
  chmodSync(value.report.state_path, 0o600);
  chmodSync(value.directory, 0o750);
  assertContractRejected(cleanupBootstrap, value.options);
});

test('a symlinked phase file is not followed or deleted by cleanup', t => {
  const value = prepared(t), victim = join(value.folder, 'unrelated-file');
  writeFileSync(victim, 'unrelated local fixture');
  const phase = join(value.directory, 'replay.toml');
  unlinkSync(phase); symlinkSync(victim, phase);
  assertContractRejected(startSafeBootstrap, value.options);
  assertContractRejected(cleanupBootstrap, value.options);
  assert.equal(readFileSync(victim, 'utf8'), 'unrelated local fixture');
  assert.ok(existsSync(value.directory));
});

test('symlinked workspace, runner temp and SQL sources cannot create preparation state', t => {
  const value = fixture(t), workspaceAlias = join(value.folder, 'workspace-alias'), tempAlias = join(value.folder, 'runner-alias');
  symlinkSync(value.workspace, workspaceAlias, 'dir'); symlinkSync(value.runnerTemp, tempAlias, 'dir');
  assert.throws(() => prepareBootstrap({ ...value.options, workspace: workspaceAlias }));
  assert.throws(() => prepareBootstrap({ ...value.options, runnerTemp: tempAlias }));
  const source = join(value.workspace, 'supabase/migrations/20260101000000_fixture.sql');
  unlinkSync(source); symlinkSync(join(value.workspace, 'supabase/config.toml'), source);
  assert.throws(() => prepareBootstrap(value.options));
  assert.deepEqual(readdirSync(value.runnerTemp), []);
});

test('cleanup refuses unexpected files without deleting its directory or unrelated bytes', t => {
  const value = prepared(t), extra = join(value.directory, 'foreign-file');
  writeFileSync(extra, 'preserve this fixture');
  assertContractRejected(cleanupBootstrap, value.options);
  assert.equal(readFileSync(extra, 'utf8'), 'preserve this fixture');
  assert.ok(existsSync(value.report.state_path));
});

test('preparation cleanup succeeds after source changes but never claims runtime cleanup PASS', t => {
  const value = prepared(t);
  writeFileSync(join(value.workspace, 'supabase/config.toml'), CONFIG + '\n# workspace changed after preparation\n');
  const result = cleanupBootstrap(value.options);
  assert.equal(result.status, 'PREPARATION_CLEANED');
  assert.equal(result.real_execution, false);
  assert.equal(result.replay_authorized, false);
  assert.equal(result.runtime_cleanup, 'NOT_EXECUTED');
  assert.equal(result.runtime_resources_created, false);
  assert.equal(existsSync(value.directory), false);
  assert.equal(lstatSync(result.retirement_marker).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(result.retirement_marker)).binding, value.binding);
  assert.throws(() => prepareBootstrap(value.options), /retired/);
  assert.throws(() => startSafeBootstrap(value.options), /retired/i);
});

test('A/B preparation keeps its complete service profile and mandatory Drizzle lane', t => {
  const value = prepared(t, 'ab'), state = JSON.parse(readFileSync(value.report.state_path));
  assert.deepEqual(state.plan.profile.requiredServices, ['postgres', 'gotrue', 'kong', 'postgrest', 'storage-api']);
  for (const service of ['kong', 'postgrest', 'storage-api']) assert.ok(!state.plan.profile.excludedServices.includes(service));
  assert.deepEqual(Object.keys(state.plan.sourceManifest), ['supabase', 'drizzle']);
  assert.deepEqual(state.plan.profile.lanes, ['supabase', 'drizzle']);
  assert.ok(state.plan.drizzleReplayManifest);
  assert.deepEqual(state.plan.commands.drizzlePrepare, ['bun', 'scripts/ci-drizzle-replay.mjs', 'prepare']);
  assert.deepEqual(state.plan.commands.drizzleMigrate, ['bunx', 'drizzle-kit', 'migrate', '--config=drizzle.ci.config.ts']);
  assert.deepEqual(state.plan.commands.drizzleVerify, ['bun', 'scripts/ci-drizzle-replay.mjs', 'verify']);
  assertRuntimeBlocked(startSafeBootstrap, value.options);
});

for (const profile of ['rls', 'ab', 'catalog']) {
  test(profile + ' preparation binds all canonical Drizzle sources and the existing replay partition', t => {
    const value = prepared(t, profile), state = JSON.parse(readFileSync(value.report.state_path));
    const canonical = canonicalReplayManifest(REPO);
    assert.equal(state.plan.sourceManifest.drizzle.length, DRIZZLE_SQL_NAMES.length);
    assert.deepEqual(state.plan.drizzleReplayManifest, canonical);
    assert.equal(state.plan.sourceManifest.drizzle.length, canonical.migrations.length + canonical.excludedReceipts.length);
    assert.equal(canonical.excludedReceipts.length, 2);
    assert.equal(state.plan.journalSha256, canonical.sourceJournalSha256);
    assert.equal(value.report.real_execution, false);
  });
}

for (const profile of ['rls', 'ab']) {
  test(profile + ' cannot prepare without its canonical Drizzle journal or a source named by that journal', t => {
    const value = fixture(t, profile), journal = join(value.workspace, 'drizzle/migrations/meta/_journal.json');
    unlinkSync(journal);
    assert.throws(() => prepareBootstrap(value.options));
    assert.deepEqual(readdirSync(value.runnerTemp), []);
    copyFileSync(join(DRIZZLE_SOURCE, 'meta/_journal.json'), journal);
    unlinkSync(join(value.workspace, 'drizzle/migrations', DRIZZLE_SQL_NAMES[0]));
    assert.throws(() => prepareBootstrap(value.options));
    assert.deepEqual(readdirSync(value.runnerTemp), []);
  });

  test(profile + ' rejects a changed Drizzle receipt copy before any runtime boundary', t => {
    const value = prepared(t, profile), canonical = canonicalReplayManifest(REPO);
    const receipt = canonical.excludedReceipts[0];
    const original = join(DRIZZLE_SOURCE, receipt.tag + '.sql');
    const sourceBytes = readFileSync(original);
    writeFileSync(join(value.workspace, 'drizzle/migrations', receipt.tag + '.sql'), Buffer.concat([sourceBytes, Buffer.from('\n-- changed fixture copy\n')]));
    assertContractRejected(startSafeBootstrap, value.options);
    assertContractRejected(replayBootstrap, value.options);
    assert.deepEqual(readFileSync(original), sourceBytes);
  });

  test(profile + ' cannot remove a required Drizzle command by rehashing its prepared plan', t => {
    const value = prepared(t, profile);
    mutateMarker(value, state => {
      delete state.plan.commands.drizzleMigrate;
      state.planDigest = hash(state.plan);
    });
    assertContractRejected(startSafeBootstrap, value.options);
    assertContractRejected(replayBootstrap, value.options);
  });
}

test('catalog preparation uses the existing full-source canonical replay partition', t => {
  const folder = mkdtempSync(join(tmpdir(), 'liftgo-bootstrap-catalog-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const binding = { sha: 'a'.repeat(40), runId: '91001', attempt: '1', job: 'offline_catalog', profile: 'catalog',
    nonce: '11111111-1111-4111-8111-111111111111' };
  const report = prepareBootstrap({ binding, workspace: REPO, runnerTemp: folder });
  const state = JSON.parse(readFileSync(report.state_path));
  assert.equal(state.plan.sourceManifest.drizzle.length,
    state.plan.drizzleReplayManifest.migrations.length + state.plan.drizzleReplayManifest.excludedReceipts.length);
  assert.equal(state.plan.drizzleReplayManifest.excludedReceipts.length, 2);
  assert.equal(state.plan.journalSha256, state.plan.drizzleReplayManifest.sourceJournalSha256);
  assert.equal(report.real_execution, false);
});
