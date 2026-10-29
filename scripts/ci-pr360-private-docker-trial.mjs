// Manual infrastructure trial v2. No database, Supabase, application or replay entry.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBinding } from './lib/ephemeral-bootstrap-contract.mjs';
import { prepareIsolatedDockerSession, startIsolatedDockerSession, privateDockerTrialContext, cleanupIsolatedDockerSession } from './lib/isolated-docker-session.mjs';
import { verifyTrialOuterTopology } from './lib/private-docker-trial-probes.mjs';

export const TRIAL_AUTHORIZATION = 'private-docker-local-only-v2';
export const REQUIRED_TRIAL_CONTROLS = Object.freeze(['daemon-host', 'sandbox-override'].flatMap(route =>
  ['direct-ipv4', 'direct-ipv6', 'direct-dnsLoopUdp', 'direct-dnsLoopTcp', 'direct-dnsNonLoopUdp', 'direct-dnsNonLoopTcp',
    'direct-ipv6Benchmark', 'dns-udp-upstream', 'dns-tcp-upstream'].map(kind => route + ':' + kind)));
const PURPOSE = 'pr360-private-docker-infrastructure-only', REAL_PRODUCER = Symbol('reviewed-cli');
const hex = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const SAFE_ENV = Object.freeze({ PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', TZ: 'UTC' });
const OPS = ['prepare', 'canariesStart', 'payloadPrepare', 'dockerPrepare', 'dockerStart', 'probe', 'dockerCleanup', 'canariesCleanup', 'payloadCleanup', 'scopeCleanup', 'publish'];
function need(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function same(left, right) { assert.deepEqual(left, right, 'Foreign trial binding'); }
export function trialReportDirectory(binding) { return '/tmp/liftgo-trial-v2-report-' + hex(validateBinding(binding)).slice(0, 24); }

export function validateTrialContext(env, checkoutSha) {
  need(env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.GITHUB_REPOSITORY === 'hlopezb83/liftgo' && env.RUNNER_ENVIRONMENT === 'github-hosted' &&
    env.RUNNER_OS === 'Linux' && env.RUNNER_ARCH === 'X64', 'DISPOSABLE_MANUAL_CONTEXT_REQUIRED');
  need(env.PR360_TRIAL_AUTHORIZATION === TRIAL_AUTHORIZATION, 'TRIAL_V2_AUTHORIZATION_REQUIRED');
  need(/^[a-f0-9]{40}$/.test(env.PR360_EXPECTED_SHA ?? '') && env.PR360_EXPECTED_SHA === env.GITHUB_SHA &&
    checkoutSha === env.GITHUB_SHA, 'EXACT_WORKFLOW_EVENT_AND_CHECKOUT_SHA_REQUIRED');
  need(env.GITHUB_WORKFLOW_REF?.startsWith('hlopezb83/liftgo/.github/workflows/pr360-network-trial.yml@'), 'WRONG_MANUAL_WORKFLOW');
  const binding = validateBinding({ sha: checkoutSha, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    job: env.GITHUB_JOB, profile: 'ab', nonce: env.PR360_TRIAL_NONCE });
  return { binding, authorization: TRIAL_AUTHORIZATION, repository: env.GITHUB_REPOSITORY, workflowRef: env.GITHUB_WORKFLOW_REF };
}

function baseReport(context, now, real) {
  return { schema_version: 2, purpose: PURPOSE, kind: real ? 'measurement' : 'fixture', context: structuredClone(context),
    startedAt: now, finishedAt: null, status: 'RUNNING', phases: [], probes: null,
    cleanup: { docker: false, canaries: false, payload: false, scope: false }, errors: [],
    sql_executed: false, replay_authorized: false, full_cleanup_verified: false };
}
function verifyProbeControls(probes, context) {
  same(probes.binding, context.binding);
  need(probes.status === 'PROBES_OBSERVED' && probes.cleanup_verified === true && probes.sql_authorized === false &&
    probes.replay_authorized === false, 'INCOMPLETE_TRIAL_PROBES');
  same(probes.controls.map(row => row.name), REQUIRED_TRIAL_CONTROLS);
  same(probes.measurements.map(row => row.route + ':' + row.kind), REQUIRED_TRIAL_CONTROLS);
  same(probes.checks, { 'daemon-host': true, 'sandbox-override': true });
  const roles = ['ipv4','ipv6','dnsLoopUdp','dnsLoopTcp','dnsNonLoopUdp','dnsNonLoopTcp','ipv6Benchmark'];
  for (const [index, row] of probes.controls.entries()) {
    need(row.positiveBefore === true && row.positiveAfter === true && row.blocked === true && row.name.startsWith(row.route + ':'), 'PROBE_CONTROL_FAILED');
    same(Object.keys(row.receiptsBefore).sort(), [...roles].sort()); same(Object.keys(row.receiptsAfter).sort(), [...roles].sort());
    for (const role of roles) need(Number.isSafeInteger(row.receiptsBefore[role]) && row.receiptsBefore[role] >= 0 &&
      row.receiptsBefore[role] === row.receiptsAfter[role], 'OUTSIDE_CANARY_RECEIPT_CHANGED');
    same(row.probe, probes.measurements[index].result);
    const p = row.probe;
    same(Object.keys(p).sort(), ['connected','received','ok','answers','rcode','errno'].sort());
    need(p.ok === false && Array.isArray(p.answers) && p.answers.length === 0, 'NEGATIVE_PROBE_SUCCEEDED');
    const unreachable = ['TIMEOUT',101,110,111,113].includes(p.errno);
    if (row.name.includes(':direct-')) need(p.connected === false && p.received === false && p.rcode === null && unreachable, 'DIRECT_PROBE_UNPROVEN');
    else need((p.connected === false || p.connected === true) && (p.received === true && [2,3].includes(p.rcode) && p.errno === null ||
      p.received === false && p.rcode === null && unreachable), 'UPSTREAM_PROBE_UNPROVEN');
  }
  verifyTrialOuterTopology({ observation: probes.topology.before, networkId: probes.resources.network });
  verifyTrialOuterTopology({ observation: probes.topology.after, networkId: probes.resources.network });
}
export async function executeTrialProtocol({ context, operations, now = Date.now, cancellation = () => false }, producer) {
  validateBinding(context.binding); need(Object.keys(operations).sort().join() === [...OPS].sort().join() &&
    Object.values(operations).every(value => typeof value === 'function'), 'COMPLETE_TRIAL_OPERATIONS_REQUIRED');
  const report = baseReport(context, now(), producer === REAL_PRODUCER), acquired = { scope: false, canaries: false, payload: false, docker: false };
  const record = phase => report.phases.push({ phase, at: now() });
  const checkpoint = () => need(!cancellation() && now() - report.startedAt < 240_000, 'TRIAL_CANCELLED_OR_WORK_BUDGET_EXCEEDED');
  try {
    // Mark attempts before awaiting: failure with partial creation must still run cleanup.
    acquired.scope = true; await operations.prepare(); record('prepare'); await operations.publish(report); checkpoint();
    acquired.canaries = true; await operations.canariesStart(); record('canaries'); checkpoint();
    acquired.payload = true; await operations.payloadPrepare(); record('payload'); checkpoint();
    acquired.docker = true; await operations.dockerPrepare(); record('docker-prepare'); checkpoint();
    await operations.dockerStart(); record('docker-start'); checkpoint();
    report.probes = await operations.probe(); verifyProbeControls(report.probes, context);
    need(report.probes.kind === (producer === REAL_PRODUCER ? 'infrastructure-probes' : 'fixture'), 'WRONG_PROBE_PRODUCER');
    record('probes'); checkpoint();
  } catch (error) { report.errors.push('TRIAL_EXECUTION_FAILED_OR_UNPROVEN',
    typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ? error.code : 'NO_SAFE_ERROR_CODE'); }
  finally {
    // Preserve live ownership capabilities here. A later CLI never resumes them from JSON.
    for (const [key, operation] of [['docker', 'dockerCleanup'], ['canaries', 'canariesCleanup'], ['payload', 'payloadCleanup'], ['scope', 'scopeCleanup']]) {
      if (!acquired[key]) continue;
      try {
        if (key === 'scope') need(['docker', 'canaries', 'payload'].every(resource => !acquired[resource] || report.cleanup[resource]), 'OWNED_RESOURCES_STILL_UNPROVEN');
        need(await operations[operation]() === true, 'CLEANUP_UNPROVEN'); report.cleanup[key] = true;
      }
      catch { report.errors.push(key.toUpperCase() + '_CLEANUP_UNPROVEN'); }
    }
    report.finishedAt = now();
    report.full_cleanup_verified = Object.values(report.cleanup).every(value => value === true);
    if (cancellation()) report.errors.push('TRIAL_CANCELLED');
    if (report.finishedAt - report.startedAt > 360_000) report.errors.push('TRIAL_TOTAL_BUDGET_EXCEEDED');
    report.status = report.errors.length === 0 && report.full_cleanup_verified && report.phases.at(-1)?.phase === 'probes'
      ? (producer === REAL_PRODUCER ? 'PASS' : 'FIXTURE_COMPLETE') : 'FAIL';
    await operations.publish(report);
  }
  return report;
}

export function verifyTrialReport(report, context, now = Date.now(), expectedSources) {
  need(report?.schema_version === 2 && report.purpose === PURPOSE && report.kind === 'measurement' && report.status === 'PASS', 'NO_TERMINAL_REAL_TRIAL_PASS');
  same(report.context, context); need(report.sql_executed === false && report.replay_authorized === false &&
    report.full_cleanup_verified === true && report.errors.length === 0, 'INCOMPLETE_INFRASTRUCTURE_ONLY_RESULT');
  same(report.cleanup, { docker: true, canaries: true, payload: true, scope: true });
  need(Array.isArray(expectedSources) && expectedSources.every(row => /^[a-f0-9]{64}$/.test(row.sha256)), 'REVIEWED_SOURCE_IDENTITIES_REQUIRED');
  same(expectedSources.map(row => row.path), TRIAL_SOURCE_FILES); same(report.sourceFiles, expectedSources);
  need(Number.isSafeInteger(report.startedAt) && Number.isSafeInteger(report.finishedAt) && report.startedAt > 0 &&
    report.finishedAt >= report.startedAt && report.finishedAt - report.startedAt <= 360_000 &&
    now >= report.finishedAt && now - report.finishedAt < 15 * 60_000, 'OLD_OR_INVALID_TRIAL_WINDOW');
  same(report.phases.map(row => row.phase), ['prepare', 'canaries', 'payload', 'docker-prepare', 'docker-start', 'probes']);
  let previous = report.startedAt;
  for (const row of report.phases) { need(Number.isSafeInteger(row.at) && row.at >= previous && row.at <= report.finishedAt, 'UNORDERED_TRIAL_PHASES'); previous = row.at; }
  verifyProbeControls(report.probes, context);
  need(report.probes.kind === 'infrastructure-probes' && report.probes.status === 'PROBES_OBSERVED' && report.probes.cleanup_verified === true &&
    report.probes.sql_authorized === false && report.probes.replay_authorized === false,
  'MISSING_PROBE_MEASUREMENTS');
  return { status: 'TRIAL_V2_PASS', replay_authorized: false, sql_authorized: false };
}

export const TRIAL_SOURCE_FILES = Object.freeze(['scripts/ci-pr360-private-docker-trial.mjs', 'scripts/ci-pr360-bootstrap-contract.mjs',
  'scripts/lib/ephemeral-bootstrap-contract.mjs', 'scripts/lib/owned-network-namespace.mjs', 'scripts/lib/outer-network-session.mjs',
  'scripts/lib/private-docker-backend.mjs', 'scripts/lib/isolated-docker-session.mjs', 'scripts/lib/private-docker-trial-probes.mjs',
  'scripts/lib/private-docker-trial-canaries.mjs', '.github/workflows/pr360-network-trial.yml']);
function git(args) { return execFileSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + process.env.GITHUB_WORKSPACE, ...args],
  { cwd: process.env.GITHUB_WORKSPACE, encoding: 'utf8', env: { ...SAFE_ENV, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, timeout: 10_000, maxBuffer: 1024 * 1024 }); }
function contextFromEnvironment() { return validateTrialContext(process.env, git(['rev-parse', 'HEAD']).trim()); }
function assertSourceBytes(context) {
  need(git(['status', '--porcelain', '--untracked-files=no']).trim() === '', 'TRACKED_CHECKOUT_CHANGED');
  return TRIAL_SOURCE_FILES.map(path => {
    const bytes = readFileSync(join(process.env.GITHUB_WORKSPACE, path));
    need(bytes.equals(Buffer.from(git(['show', context.binding.sha + ':' + path]))), 'REVIEWED_SOURCE_CHANGED');
    return { path, sha256: hex(bytes) };
  });
}
function atomicReport(context, report) {
  const directory = trialReportDirectory(context.binding), file = directory + '/result.json';
  try { mkdirSync(directory, { mode: 0o755 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const row = lstatSync(directory);
  need(row.isDirectory() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o022) === 0 && realpathSync(directory) === directory, 'UNOWNED_REPORT_DIRECTORY');
  const temporary = directory + '/report-' + randomUUID();
  writeFileSync(temporary, JSON.stringify({ ...report, digest: hex(report) }) + '\n', { flag: 'wx', mode: 0o644 }); renameSync(temporary, file);
}
function observeTool(path, version) {
  const resolved = realpathSync(path), stat = lstatSync(resolved);
  need(stat.isFile() && stat.uid === 0 && (stat.mode & 0o022) === 0 && (stat.mode & 0o111) !== 0, 'UNTRUSTED_RUNNER_TOOL');
  const result = { path: resolved, sha256: hex(readFileSync(resolved)) };
  if (version) {
    const text = execFileSync(resolved, ['--version'], { env: { ...SAFE_ENV }, encoding: 'utf8', timeout: 5000 });
    const match = /\bv?(\d+\.\d+\.\d+)\b/.exec(text); need(match, 'UNOBSERVED_TOOL_VERSION'); result.version = match[1];
  }
  return result;
}
function findTool(name) {
  for (const directory of ['/usr/bin', '/usr/local/bin', '/usr/sbin', '/sbin']) {
    try { return observeTool(directory + '/' + name, name !== 'python3'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  need(false, 'REQUIRED_RUNNER_TOOL_MISSING');
}
export async function retireCanaryObservers(cap, io) {
  let measured = false;
  try {
    await io.positiveTrialCanaries(cap);
    const observed = io.snapshotTrialCanaries(cap);
    measured = Object.values(observed.unexpectedReceipts).every(value => value === 0);
  } catch { /* Measurement failure still requires actual retirement. */ }
  const cleaned = (await io.cleanupTrialCanaries(cap)).status === 'LOCAL_CANARIES_CLEANED';
  return measured && cleaned;
}

// Construction performs no operations. Only the manual CLI below calls these defaults.
function defaultOperations(context, cancellation) {
  let scope, scopeInode, canaries, payload, docker, tools, probeModule, canaryModule, sources, deadlineAt, networkInode;
  const ownedScope = () => { need(scope && lstatSync(scope).ino === scopeInode && realpathSync(scope) === scope && lstatSync(scope).uid === 0, 'PRIVATE_SCOPE_CHANGED'); };
  return {
    async prepare() {
      need(process.getuid() === 0, 'ROOT_SUPERVISOR_REQUIRED'); sources = assertSourceBytes(context); deadlineAt = Date.now() + 240_000;
      tools = { python: findTool('python3'), containerd: findTool('containerd'), dockerd: findTool('dockerd'), docker: findTool('docker') };
      scope = mkdtempSync('/tmp/liftgo-trial-v2-'); scopeInode = lstatSync(scope).ino;
      probeModule = await import('./lib/private-docker-trial-probes.mjs'); canaryModule = await import('./lib/private-docker-trial-canaries.mjs');
    },
    async canariesStart() { ownedScope(); canaries = await canaryModule.startTrialCanaries({ binding: context.binding, directory: scope }); },
    async payloadPrepare() { ownedScope(); payload = await probeModule.prepareTrialPayload({ directory: scope, nonce: context.binding.nonce, pythonPath: tools.python.path }); },
    async dockerPrepare() { ownedScope(); docker = await prepareIsolatedDockerSession({ binding: context.binding, runnerTemp: scope, toolchain: tools, trialResolver: 'private-docker-trial-v2' }); },
    async dockerStart() { const result = await startIsolatedDockerSession(docker); networkInode = result.outer.owner.anchor.namespaceInode; },
    async probe() {
      const descriptor = privateDockerTrialContext(docker);
      return probeModule.runPrivateDockerTrialProbes({ ...descriptor, payload, binding: context.binding, deadlineAtMs: deadlineAt, cancelled: cancellation,
        canaries: { snapshot: () => canaryModule.snapshotTrialCanaries(canaries), positive: () => canaryModule.positiveTrialCanaries(canaries) } });
    },
    async dockerCleanup() {
      if (!docker) return false; const result = await cleanupIsolatedDockerSession(docker);
      if (networkInode) for (const pid of readdirSync('/proc').filter(name => /^[1-9][0-9]*$/.test(name))) {
        try { need(statSync('/proc/' + pid + '/ns/net').ino !== networkInode, 'OWNED_NAMESPACE_PROCESS_REMAINS'); }
        catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
      }
      return result.status === 'ISOLATED_DOCKER_COMPONENTS_CLEANED';
    },
    async canariesCleanup() {
      if (!canaries) return false;
      return retireCanaryObservers(canaries, canaryModule);
    },
    async payloadCleanup() { if (!payload) return false; const result = await probeModule.cleanupTrialPayload(payload); return result.status === 'TRIAL_PAYLOAD_CLEANED' && result.cleanup_verified === true; },
    async scopeCleanup() { ownedScope(); rmSync(scope, { recursive: true, force: false }); return true; },
    async publish(report) { atomicReport(context, { ...report, ownedScope: scope ? { path: scope, inode: scopeInode } : null,
      sourceFiles: sources ?? [], tools: tools ?? null }); },
  };
}

async function main() {
  const operation = process.argv[2]; need(process.argv.length === 3 && ['context', 'run', 'verify'].includes(operation), 'INVALID_TRIAL_OPERATION');
  if (operation === 'context') {
    process.env.PR360_TRIAL_NONCE = randomUUID(); const context = contextFromEnvironment();
    writeFileSync(process.env.GITHUB_OUTPUT, 'nonce=' + context.binding.nonce + '\nreport_dir=' + trialReportDirectory(context.binding) + '\n', { flag: 'a' }); return;
  }
  const context = contextFromEnvironment();
  if (operation === 'verify') {
    const directory = trialReportDirectory(context.binding), file = directory + '/result.json', stat = lstatSync(file), parent = lstatSync(directory);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && parent.uid === 0 && (parent.mode & 0o022) === 0 &&
      realpathSync(file) === file && stat.size < 512 * 1024, 'UNOWNED_OR_OVERSIZED_REPORT');
    const saved = JSON.parse(readFileSync(file, 'utf8')), { digest, ...report } = saved; need(hex(report) === digest, 'REPORT_CHANGED');
    verifyTrialReport(report, context, Date.now(), assertSourceBytes(context)); console.log('TRIAL_V2_PASS: infrastructure only; replay_authorized=false'); return;
  }
  let cancelled = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cancelled = true; });
  const report = await executeTrialProtocol({ context, operations: defaultOperations(context, () => cancelled), cancellation: () => cancelled }, REAL_PRODUCER);
  need(report.status === 'PASS', 'TRIAL_V2_FAILED_OR_CLEANUP_UNPROVEN');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error('TRIAL_V2_FAILED: inspect safe metadata; no replay authorization'); process.exitCode = 1; });
