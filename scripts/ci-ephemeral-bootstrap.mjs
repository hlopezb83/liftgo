// Local preparation is implemented. No fixture or saved JSON is a runtime capability.
// The supported CLI has no pre-start hook for all future Docker auxiliaries; see docs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';
import { canonicalReplayManifest } from './ci-drizzle-replay.mjs';
import { createCorePlan, validateBinding } from './lib/ephemeral-bootstrap-contract.mjs';

const PURPOSE = 'liftgo-ephemeral-bootstrap';
const RESOURCES = ['processes', 'containers', 'volumes', 'networks', 'namespaces', 'rules', 'canaries'];
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : JSON.stringify(value)).digest('hex');
const emptyResources = () => Object.fromEntries(RESOURCES.map(key => [key, []]));

export class BootstrapBlocked extends Error {
  constructor(code, message) { super(message); this.name = 'BootstrapBlocked'; this.code = code; }
}

function regularFile(file, privateMode = false) {
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && realpathSync(file) === file, 'Regular local file required');
  if (privateMode) assert.ok(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'Private ownership file required');
  return readFileSync(file);
}
function ownedDirectory(directory, privateMode = false) {
  const stat = lstatSync(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(directory) === directory
    && stat.uid === process.getuid(), 'Local runner-owned directory required');
  if (privateMode) assert.equal(stat.mode & 0o077, 0, 'Session directory must be private');
}
function absent(file) {
  try { lstatSync(file); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
function writePrivate(file, value) {
  writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
}
function paths(binding, runnerTemp) {
  const normalized = validateBinding(binding), temporary = resolve(runnerTemp);
  ownedDirectory(temporary);
  const name = `liftgo-bootstrap-${normalized.job}-${normalized.profile}-${hash(normalized).slice(0, 24)}`;
  return { directory: join(temporary, name), retired: join(temporary, name + '.retired'), temporary };
}
function sourceManifest(workspace, lane) {
  const folder = join(workspace, lane, 'migrations');
  assert.equal(realpathSync(folder), folder, 'Migration directory cannot be a symlink');
  return readdirSync(folder).filter(name => name.endsWith('.sql')).sort().map(name => {
    assert.match(name, /^[A-Za-z0-9_-]+\.sql$/, 'Unmodeled SQL filename');
    return { path: `${lane}/migrations/${name}`, sha256: hash(regularFile(join(folder, name))) };
  });
}
function currentPlan(binding, workspace) {
  const sourceConfig = regularFile(join(workspace, 'supabase/config.toml'));
  const canonicalConfig = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceConfig);
  const source = { supabase: sourceManifest(workspace, 'supabase'), drizzle: sourceManifest(workspace, 'drizzle') };
  const journalSha256 = hash(regularFile(join(workspace, 'drizzle/migrations/meta/_journal.json')));
  // All three existing workflows apply Drizzle after Supabase. The same canonical
  // reader verifies the full journal and its two established receipts for every profile.
  // No additional exclusion list is accepted by this core.
  const drizzleReplayManifest = canonicalReplayManifest(workspace);
  return createCorePlan({ binding, canonicalConfig, sourceManifest: source, journalSha256, drizzleReplayManifest });
}
function bindingEqual(left, right) { assert.deepEqual(validateBinding(left), validateBinding(right), 'Foreign session binding'); }
function preparationSummary(state, statePath) {
  return { schema_version: 1, producer: PURPOSE, kind: 'local-preparation', binding: state.binding,
    project_id: state.plan.projectId, state_path: statePath, phase: state.phase,
    status: 'PREPARED_RUNTIME_BLOCKED', real_execution: false, replay_authorized: false,
    source_digest: state.planDigest, config_digests: state.plan.configDigests, blockers: state.plan.blockers };
}

/** Creates only private preparation files. It never creates a network, process, DB or container. */
export function prepareBootstrap({ binding, workspace, runnerTemp }) {
  const normalized = validateBinding(binding), root = resolve(workspace);
  ownedDirectory(root);
  const target = paths(normalized, runnerTemp);
  assert.ok(absent(target.retired), 'This exact session was already retired');
  const plan = currentPlan(normalized, root);
  mkdirSync(target.directory, { mode: 0o700 }); // A preexisting session is never reused.
  const state = { schema_version: 1, purpose: PURPOSE, kind: 'local-preparation', binding: normalized,
    workspace: root, runnerTemp: target.temporary, preparedAt: Date.now(), phase: 'prepared',
    resources: emptyResources(), plan, planDigest: hash(plan) };
  try {
    for (const [phase, text] of Object.entries(plan.configs)) writePrivate(join(target.directory, phase + '.toml'), text);
    writePrivate(join(target.directory, 'ownership.json'), JSON.stringify(state) + '\n');
  } catch (error) {
    // Only this newly-created, still empty-of-runtime session is eligible for rollback.
    rmSync(target.directory, { recursive: true, force: true });
    throw error;
  }
  return preparationSummary(state, join(target.directory, 'ownership.json'));
}

function readPreparation({ binding, workspace, runnerTemp }, recheckSources = false) {
  const target = paths(binding, runnerTemp);
  assert.ok(absent(target.retired), 'Retired session cannot be resumed');
  ownedDirectory(target.directory, true);
  const state = JSON.parse(regularFile(join(target.directory, 'ownership.json'), true));
  bindingEqual(state.binding, binding);
  assert.equal(state.schema_version, 1); assert.equal(state.purpose, PURPOSE);
  assert.equal(state.kind, 'local-preparation'); assert.equal(state.phase, 'prepared');
  assert.equal(state.workspace, resolve(workspace)); assert.equal(state.runnerTemp, target.temporary);
  assert.ok(Number.isSafeInteger(state.preparedAt) && state.preparedAt > 0, 'Invalid ownership timestamp');
  assert.deepEqual(state.resources, emptyResources(), 'Runtime resources cannot be invented in a preparation marker');
  assert.equal(state.planDigest, hash(state.plan), 'Preparation plan changed');
  bindingEqual(state.plan.binding, binding);
  const recreated = createCorePlan({ binding: state.plan.binding, canonicalConfig: state.plan.configs.source,
    sourceManifest: state.plan.sourceManifest, journalSha256: state.plan.journalSha256,
    drizzleReplayManifest: state.plan.drizzleReplayManifest });
  assert.deepEqual(state.plan, recreated, 'Plan contains overrides outside the bounded core');
  for (const [phase, text] of Object.entries(state.plan.configs)) {
    assert.equal(regularFile(join(target.directory, phase + '.toml'), true).toString('utf8'), text, 'Phase config changed');
  }
  if (recheckSources) assert.deepEqual(state.plan, currentPlan(binding, resolve(workspace)), 'Checkout sources or canonical journal changed');
  return { state, target };
}

function denyUnavailableRuntime(operation) {
  // This is an explicit technical boundary, not an authorization prompt or an injectable driver.
  // A host-daemon internal bridge cannot establish all future-auxiliary and DNS guards pre-start.
  // A private-daemon alternative additionally needs different publication/cgroup semantics and a new real trial.
  throw new BootstrapBlocked('PRESTART_CONTAINMENT_UNIMPLEMENTED',
    `${operation} blocked before any Supabase/Docker/SQL command: no reviewed producer of whole-session pre-start containment`);
}
export function startSafeBootstrap(options) { readPreparation(options, true); denyUnavailableRuntime('start-safe'); }
export function replayBootstrap(options) { readPreparation(options, true); denyUnavailableRuntime('replay'); }

/** Cleanup here covers preparation files only; it cannot claim runtime cleanup PASS. */
export function cleanupBootstrap(options) {
  const { state, target } = readPreparation(options);
  const expectedFiles = ['bootstrap.toml', 'ownership.json', 'replay.toml', 'source.toml'];
  assert.deepEqual(readdirSync(target.directory).sort(), expectedFiles, 'Unexpected files prevent preparation cleanup');
  for (const name of expectedFiles) regularFile(join(target.directory, name), true);
  writePrivate(target.retired, JSON.stringify({ purpose: PURPOSE, binding: state.binding, retiredAt: Date.now() }) + '\n');
  rmSync(target.directory, { recursive: true });
  assert.ok(absent(target.directory), 'Preparation files remain');
  return { schema_version: 1, producer: PURPOSE, binding: state.binding, phase: 'cleanup',
    status: 'PREPARATION_CLEANED', real_execution: false, replay_authorized: false,
    runtime_cleanup: 'NOT_EXECUTED', runtime_resources_created: false, retirement_marker: target.retired };
}

function cliOptions(argv, env) {
  assert.equal(argv.length, 5, 'Usage: prepare|start-safe|replay|cleanup --profile catalog|rls|ab --expected-sha SHA');
  const [operation, profileFlag, profile, shaFlag, sha] = argv;
  assert.ok(['prepare', 'start-safe', 'replay', 'cleanup'].includes(operation));
  assert.equal(profileFlag, '--profile'); assert.equal(shaFlag, '--expected-sha');
  for (const [key, value] of Object.entries({ CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    GITHUB_REPOSITORY: 'hlopezb83/liftgo', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64' })) assert.equal(env[key], value, 'Invalid CI context: ' + key);
  assert.ok(['pull_request', 'push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
  assert.equal(env.GITHUB_SHA, sha, 'Workflow/expected SHA mismatch');
  const binding = validateBinding({ sha, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    job: env.GITHUB_JOB, profile, nonce: env.PR360_BOOTSTRAP_NONCE });
  const workspace = realpathSync(env.GITHUB_WORKSPACE);
  assert.equal(workspace, process.cwd());
  const git = args => execFileSync('/usr/bin/git', args, { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(git(['rev-parse', 'HEAD']).trim(), sha, 'Checkout SHA differs');
  git(['ls-files', '--error-unmatch', '--', 'scripts/ci-ephemeral-bootstrap.mjs',
    'scripts/lib/ephemeral-bootstrap-contract.mjs', 'scripts/ci-pr360-bootstrap-contract.mjs', 'scripts/ci-drizzle-replay.mjs']);
  git(['diff', '--quiet', 'HEAD', '--', 'supabase/config.toml', 'supabase/migrations', 'drizzle/migrations',
    'scripts/ci-ephemeral-bootstrap.mjs', 'scripts/lib/ephemeral-bootstrap-contract.mjs',
    'scripts/ci-pr360-bootstrap-contract.mjs', 'scripts/ci-drizzle-replay.mjs']);
  const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'supabase/migrations', 'drizzle/migrations'])
    .split('\n').filter(path => path.endsWith('.sql')).sort();
  const observed = ['supabase', 'drizzle'].flatMap(lane => sourceManifest(workspace, lane).map(row => row.path)).sort();
  assert.deepEqual(observed, tracked, 'Untracked or missing SQL source');
  return { operation, binding, workspace, runnerTemp: env.RUNNER_TEMP };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = cliOptions(process.argv.slice(2), process.env);
    const operations = { prepare: prepareBootstrap, 'start-safe': startSafeBootstrap, replay: replayBootstrap, cleanup: cleanupBootstrap };
    console.info(JSON.stringify(operations[options.operation](options)));
  } catch (error) {
    console.error(JSON.stringify({ schema_version: 1, status: 'BLOCKED', real_execution: false, replay_authorized: false,
      code: error instanceof BootstrapBlocked ? error.code : 'PREPARATION_CONTRACT_REJECTED' }));
    process.exitCode = 1; // Never print raw command output or SQL/config values.
  }
}
