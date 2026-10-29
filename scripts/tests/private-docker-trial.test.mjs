import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { executeTrialProtocol, validateTrialContext, verifyTrialReport, trialReportDirectory, retireCanaryObservers,
  REQUIRED_TRIAL_CONTROLS, TRIAL_SOURCE_FILES, TRIAL_AUTHORIZATION } from '../ci-pr360-private-docker-trial.mjs';
import { REQUIRED_TRIAL_PROBE_CONTROLS } from '../lib/private-docker-trial-probes.mjs';

function topologyFixture() {
  const bridge = 'br-' + '2'.repeat(12);
  const links = [
    { ifindex: 1, ifname: 'lo', flags: ['LOOPBACK','UP'], link_type: 'loopback' },
    { ifindex: 2, ifname: 'docker0', flags: ['BROADCAST'], linkinfo: { info_kind: 'bridge' } },
    { ifindex: 3, ifname: bridge, flags: ['BROADCAST','UP'], linkinfo: { info_kind: 'bridge' } },
    ...[4,5].map(i => ({ ifindex: i, ifname: 'veth'+i, flags: ['UP'], master: bridge, linkinfo: { info_kind: 'veth' } })),
  ];
  return { links, addresses: links.map(row => ({ ifname: row.ifname, ifindex: row.ifindex,
    addr_info: row.ifname === 'lo' ? [{ family: 'inet', local: '127.0.0.1', prefixlen: 8, scope: 'host' },{ family: 'inet6', local: '::1', prefixlen: 128, scope: 'host' }] :
    row.ifname === 'docker0' ? [{ family: 'inet', local: '172.30.36.1', prefixlen: 24, scope: 'global' }] :
    row.ifname === bridge ? [{ family: 'inet', local: '198.19.36.1', prefixlen: 24, scope: 'global' }] : [] })),
    ipv4Routes: [{ dev: 'docker0', dst: '172.30.36.0/24', protocol: 'kernel', scope: 'link', prefsrc: '172.30.36.1' },
      { dev: bridge, dst: '198.19.36.0/24', protocol: 'kernel', scope: 'link', prefsrc: '198.19.36.1' },
      { dev: 'lo', dst: '127.0.0.0/8', protocol: 'kernel', type: 'local', table: 'local' }],
    ipv6Routes: [{ dev: 'lo', dst: '::1', protocol: 'kernel', type: 'local', table: 'local' }] };
}
function fixture() {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'hlopezb83/liftgo',
    RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', PR360_TRIAL_AUTHORIZATION: TRIAL_AUTHORIZATION,
    GITHUB_SHA: 'a'.repeat(40), PR360_EXPECTED_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '9001', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'private-docker-trial',
    PR360_TRIAL_NONCE: '11111111-1111-4111-8111-111111111111', GITHUB_WORKFLOW_REF: 'hlopezb83/liftgo/.github/workflows/pr360-network-trial.yml@refs/heads/manual-v2' };
  const context = validateTrialContext(env, env.GITHUB_SHA), calls = [], data = { fail: '', cleanupFalse: '', cancelled: false, time: 10000 };
  const roles = ['ipv4','ipv6','dnsLoopUdp','dnsLoopTcp','dnsNonLoopUdp','dnsNonLoopTcp','ipv6Benchmark'];
  const probes = { kind: 'fixture', binding: context.binding, status: 'PROBES_OBSERVED', cleanup_verified: true,
    sql_authorized: false, replay_authorized: false, controls: REQUIRED_TRIAL_CONTROLS.map(name => ({ name, blocked: true,
      route: name.split(':')[0], positiveBefore: true, positiveAfter: true,
      receiptsBefore: Object.fromEntries(roles.map(role => [role,3])), receiptsAfter: Object.fromEntries(roles.map(role => [role,3])),
      probe: { connected: false, received: false, ok: false, answers: [], rcode: null, errno: 111 } })),
    resources: { network: '2'.repeat(64) }, topology: { before: topologyFixture(), after: topologyFixture() },
    checks: { 'daemon-host': true, 'sandbox-override': true } };
  probes.measurements = probes.controls.map(row => ({ route: row.route, kind: row.name.split(':')[1], result: structuredClone(row.probe) }));
  const operations = Object.fromEntries(['prepare','canariesStart','payloadPrepare','dockerPrepare','dockerStart','probe','dockerCleanup','canariesCleanup','payloadCleanup','scopeCleanup','publish'].map(name => [name, async () => {
    calls.push(name); if (data.fail === name) { const error = new Error('private child output'); error.code = 'CONTROLLED_TEST_FAILURE'; throw error; }
    if (name === 'probe') return structuredClone(probes);
    if (name.endsWith('Cleanup')) return data.cleanupFalse !== name;
    return undefined;
  }]));
  return { env, context, data, calls, probes, operations, run: () => executeTrialProtocol({ context, operations, now: () => data.time++, cancellation: () => data.cancelled }) };
}
function measuredReport(f) {
  const sources = TRIAL_SOURCE_FILES.map(path => ({ path, sha256: 'b'.repeat(64) }));
  return { report: { schema_version: 2, purpose: 'pr360-private-docker-infrastructure-only', kind: 'measurement', status: 'PASS',
    context: f.context, startedAt: 10000, finishedAt: 11000, phases: ['prepare','canaries','payload','docker-prepare','docker-start','probes'].map((phase,i) => ({ phase, at: 10001+i })),
    cleanup: { docker: true, canaries: true, payload: true, scope: true }, sourceFiles: sources,
    sql_executed: false, replay_authorized: false, full_cleanup_verified: true, errors: [], probes: { ...structuredClone(f.probes), kind: 'infrastructure-probes' } }, sources };
}

test('manual context binds SHA, run, attempt, job, fixed ab infrastructure profile and nonce', () => {
  const f = fixture(); assert.equal(f.context.binding.profile, 'ab'); assert.match(trialReportDirectory(f.context.binding), /^\/tmp\/liftgo-trial-v2-report-[a-f0-9]{24}$/);
  assert.deepEqual(REQUIRED_TRIAL_CONTROLS, REQUIRED_TRIAL_PROBE_CONTROLS);
});
for (const [field, value] of Object.entries({ CI: 'false', GITHUB_ACTIONS: 'false', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'other/repo',
  RUNNER_ENVIRONMENT: 'self-hosted', RUNNER_OS: 'Windows', RUNNER_ARCH: 'ARM64', PR360_TRIAL_AUTHORIZATION: 'local-network-only-v1',
  GITHUB_SHA: 'b'.repeat(40), PR360_EXPECTED_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '0', GITHUB_RUN_ATTEMPT: '0', GITHUB_JOB: '',
  PR360_TRIAL_NONCE: 'not-a-nonce', GITHUB_WORKFLOW_REF: 'other/workflow' })) test(`context rejects altered ${field}`, () => {
  const f = fixture(); assert.throws(() => validateTrialContext({ ...f.env, [field]: value }, 'a'.repeat(40)));
});
test('checkout SHA mismatch never becomes an infrastructure authorization', () => {
  const f = fixture(); assert.throws(() => validateTrialContext(f.env, 'b'.repeat(40)));
});
test('successful fixture runs actual protocol ordering but cannot emit or verify real PASS', async () => {
  const f = fixture(), report = await f.run();
  assert.equal(report.status, 'FIXTURE_COMPLETE'); assert.equal(report.kind, 'fixture'); assert.equal(report.replay_authorized, false);
  assert.deepEqual(f.calls.filter(name => name.endsWith('Cleanup')), ['dockerCleanup','canariesCleanup','payloadCleanup','scopeCleanup']);
  assert.throws(() => verifyTrialReport(report, f.context, 12000, []), /NO_TERMINAL_REAL_TRIAL_PASS/);
});
for (const stage of ['prepare','canariesStart','payloadPrepare','dockerPrepare','dockerStart','probe']) test(`failure at ${stage} attempts acquired cleanup and never PASS`, async () => {
  const f = fixture(); f.data.fail = stage; const report = await f.run(); assert.equal(report.status, 'FAIL');
  assert.equal(report.errors.includes('CONTROLLED_TEST_FAILURE'), true); assert.equal(JSON.stringify(report).includes('private child output'), false);
  assert.equal(f.calls.includes('scopeCleanup'), true);
});
for (const stage of ['dockerCleanup','canariesCleanup','payloadCleanup','scopeCleanup']) test(`failed ${stage} blocks terminal status and preserves uncertain scope`, async () => {
  const f = fixture(); f.data.cleanupFalse = stage; const report = await f.run(); assert.equal(report.status, 'FAIL');
  if (stage !== 'scopeCleanup') assert.equal(f.calls.includes('scopeCleanup'), false);
});
test('cancellation before work still retires only resources acquired in this session', async () => {
  const f = fixture(); f.data.cancelled = true; const report = await f.run(); assert.equal(report.status, 'FAIL');
  assert.equal(f.calls.includes('dockerPrepare'), false); assert.equal(f.calls.includes('scopeCleanup'), true);
});
test('time budget exceeded invalidates completion and still attempts cleanup', async () => {
  const f = fixture(), original = f.operations.probe;
  f.operations.probe = async () => { const result = await original(); f.data.time += 400000; return result; };
  const report = await f.run(); assert.equal(report.status, 'FAIL'); assert.equal(report.errors.includes('TRIAL_TOTAL_BUDGET_EXCEEDED'), true);
  assert.equal(f.calls.includes('dockerCleanup'), true);
});
test('omitted or failed negative control cannot produce even fixture completion', async () => {
  for (const mutate of [f => f.probes.controls.pop(), f => { f.probes.controls[0].blocked = false; }, f => { f.probes.controls[0].receiptsAfter.ipv4++; }]) {
    const f = fixture(); mutate(f); assert.equal((await f.run()).status, 'FAIL');
  }
});
test('pure verifier accepts coherent measurement fixture only as infrastructure, never replay', () => {
  const f = fixture(), { report, sources } = measuredReport(f);
  assert.deepEqual(verifyTrialReport(report, f.context, 12000, sources), { status: 'TRIAL_V2_PASS', replay_authorized: false, sql_authorized: false });
});
for (const [name, mutate] of [
  ['old result', r => { r.finishedAt = 10001; }], ['missing cleanup', r => { r.cleanup.docker = false; }],
  ['skipped producer', r => { r.phases.splice(4,1); }], ['cancelled', r => { r.status = 'CANCELLED'; }],
  ['fixture relabel', r => { r.kind = 'fixture'; }], ['wrong SHA', r => { r.context = { ...r.context, binding: { ...r.context.binding, sha: 'b'.repeat(40) } }; }],
  ['wrong attempt', r => { r.context = { ...r.context, binding: { ...r.context.binding, attempt: '2' } }; }],
  ['unknown control', r => { r.probes.controls[0].name = 'different'; }], ['source changed', r => { r.sourceFiles = r.sourceFiles.slice(1); }],
  ['SQL grant', r => { r.sql_executed = true; }], ['failed cleanup evidence', r => { r.full_cleanup_verified = false; }],
  ['contradictory raw connected probe', r => { r.probes.controls[0].probe.connected = true; r.probes.measurements[0].result.connected = true; }],
  ['invalid DNS raw error', r => { r.probes.controls[0].probe.errno = 'INVALID_DNS'; r.probes.measurements[0].result.errno = 'INVALID_DNS'; }],
  ['omitted raw measurement', r => { r.probes.measurements.pop(); }],
  ['added uplink', r => { r.probes.topology.after.links.push({ ifname: 'eth0', ifindex: 9 }); }],
  ['added default route', r => { r.probes.topology.after.ipv4Routes.push({ dst: 'default', dev: 'docker0', gateway: '172.30.36.1' }); }],
]) test(`terminal verification blocks ${name}`, () => {
  const f = fixture(), { report, sources } = measuredReport(f); mutate(report);
  const now = name === 'old result' ? 10001+900000 : 12000;
  assert.throws(() => verifyTrialReport(report, f.context, now, sources));
});
test('absent source identities cannot verify a result', () => {
  const f = fixture(), { report } = measuredReport(f); assert.throws(() => verifyTrialReport(report, f.context, 12000));
});
for (const mode of ['positive-failed','snapshot-failed','late-packet','cleanup-failed','success']) test(`observer retirement always attempts cleanup: ${mode}`, async () => {
  let cleanup = 0;
  const io = { async positiveTrialCanaries() { if (mode === 'positive-failed') throw new Error('private'); },
    snapshotTrialCanaries() { if (mode === 'snapshot-failed') throw new Error('private'); return { unexpectedReceipts: { a: mode === 'late-packet' ? 1 : 0 } }; },
    async cleanupTrialCanaries() { cleanup++; if (mode === 'cleanup-failed') throw new Error('private'); return { status: 'LOCAL_CANARIES_CLEANED' }; } };
  if (mode === 'cleanup-failed') await assert.rejects(retireCanaryObservers({}, io));
  else assert.equal(await retireCanaryObservers({}, io), mode === 'success');
  assert.equal(cleanup, 1);
});
test('workflow is manual-only, pinned, bounded and does not resume capabilities or inherit root secrets', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/pr360-network-trial.yml', import.meta.url), 'utf8');
  assert.match(yaml, /workflow_dispatch:/); assert.doesNotMatch(yaml, /^  (push|pull_request|workflow_call|schedule|workflow_run|pull_request_target):/m);
  assert.match(yaml, /private-docker-local-only-v2/); assert.doesNotMatch(yaml, /local-network-only-v1/);
  assert.match(yaml, /timeout-minutes: 15/); assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(yaml, /upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(yaml, /sudo \/usr\/bin\/env -i/); assert.doesNotMatch(yaml, /secrets\.|GITHUB_TOKEN|preserve-env|workflow_call|supabase start|migration up/);
  assert.match(yaml, /mjs verify/); assert.doesNotMatch(yaml, /mjs cleanup/);
});
