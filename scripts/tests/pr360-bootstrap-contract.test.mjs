import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createBootstrapPlan, verifyBootstrapFixture } from '../ci-pr360-bootstrap-contract.mjs';

const CANONICAL = 'project_id = "fixture_local"\n\n[functions.example]\nverify_jwt = true\n';

function fixture() {
  const plan = createBootstrapPlan(CANONICAL);
  const context = { sha: 'a'.repeat(40), runId: '9001', attempt: '1', job: 'supabase-replay',
    nonce: '11111111-1111-4111-8111-111111111111', startedAt: 1000, finishedAt: 10000 };
  const expected = {
    supabaseVersions: ['20260101000000', '20260102000000'],
    drizzleLedger: [{ hash: '5'.repeat(64), created_at: 1700000001000 }, { hash: '6'.repeat(64), created_at: 1700000002000 }],
    sourceManifest: {
      supabase: [{ path: 'supabase/migrations/20260101000000_first.sql', sha256: '3'.repeat(64) },
        { path: 'supabase/migrations/20260102000000_second.sql', sha256: '4'.repeat(64) }],
      drizzle: [{ path: 'drizzle/migrations/0000_first.sql', sha256: '5'.repeat(64) },
        { path: 'drizzle/migrations/0001_second.sql', sha256: '6'.repeat(64) }],
    },
    vendorBaseline: { extensions: ['pg_cron', 'pg_net', 'plpgsql'],
      roles: ['anon', 'authenticated', 'postgres', 'service_role'], schemas: ['auth', 'cron', 'public', 'storage'] },
  };
  const networkId = 'd'.repeat(64);
  const networkName = 'liftgo_pr360_9001_1_11111111';
  const guard = { internal: true, ipv4_deny: true, ipv6_deny: true, dns_deny: true,
    host_gateway_deny: true, auxiliaries_covered: true, native_processes_covered: true,
    local_sql_allowed: true, local_positive: true, external_canary_attempts: 2,
    external_canary_receipts: 0, policy_ids: ['fixture-policy'] };
  const guc = { name: 'cron.launch_active_jobs', setting: 'off', source: 'configuration file', pending_restart: false, context: 'sighup' };
  const phase = (name, at, data) => ({ phase: name, sha: context.sha, runId: context.runId,
    attempt: context.attempt, job: context.job, nonce: context.nonce, at, ...data });
  const evidence = { kind: 'fixture', phases: [
    phase('egress-before-start', 2000, { networkId, networkName, guard: structuredClone(guard) }),
    phase('bootstrap', 3000, { startedAt: 2500, config: plan.bootstrapConfig,
      command: plan.commands.bootstrap.map(value => value === '<owned-network-name>' ? networkName : value),
      appliedVersions: [], cronJobs: [], applicationObjects: [], vendorBaseline: structuredClone(expected.vendorBaseline) }),
    phase('cron-off', 4000, { guc: structuredClone(guc), activeCronRuns: 0 }),
    phase('release', 5000, { config: plan.replayConfig, command: plan.commands.replay,
      requestedVersions: structuredClone(expected.supabaseVersions) }),
    phase('replay', 6000, { startedAt: 5500, appliedVersions: structuredClone(expected.supabaseVersions),
      drizzleLedger: structuredClone(expected.drizzleLedger), sourceManifest: structuredClone(expected.sourceManifest),
      vendorBaseline: structuredClone(expected.vendorBaseline) }),
    phase('final-guards', 7000, { networkId, networkName, guard: structuredClone(guard), guc: structuredClone(guc), activeCronRuns: 0 }),
    phase('cleanup', 8000, { ownershipVerified: true, stopAttempted: true, stopFailed: false,
      remaining: { processes: [], containers: [], volumes: [], networks: [], namespaces: [], rules: [], canaries: [] } }),
  ] };
  return { context, plan, expected, evidence };
}

function rejectMutation(mutate) {
  const value = fixture();
  assert.doesNotThrow(() => verifyBootstrapFixture(value), 'Every negative control must start with a valid fixture');
  mutate(value);
  assert.throws(() => verifyBootstrapFixture(value));
}

test('the offline plan disables history and seed during bootstrap and cannot authorize execution', () => {
  const plan = createBootstrapPlan(CANONICAL);
  assert.match(plan.bootstrapConfig, /\[db\.migrations\]\s*\nenabled\s*=\s*false/);
  assert.match(plan.bootstrapConfig, /\[db\.seed\]\s*\nenabled\s*=\s*false/);
  assert.match(plan.replayConfig, /\[db\.seed\]\s*\nenabled\s*=\s*false/);
  assert.doesNotMatch(plan.replayConfig, /\[db\.migrations\]/);
  assert.deepEqual(plan.commands.replay, ['supabase', 'migration', 'up', '--local']);
  assert.equal(plan.status, 'BLOCKED');
  assert.equal(plan.real_execution, false);
  assert.ok(plan.blockers.length > 0);
});

test('the actual committed Supabase config is accepted without enabling runtime integration', () => {
  const source = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const plan = createBootstrapPlan(source);
  assert.equal(plan.status, 'BLOCKED');
  assert.equal(plan.real_execution, false);
});

test('an absent fixture transcript cannot prove readiness', () => {
  assert.throws(() => verifyBootstrapFixture({}));
});

test('a coherent synthetic transcript validates only the offline contract and never runtime safety', () => {
  const value = fixture();
  const result = verifyBootstrapFixture(value);
  assert.equal(result.contract, 'VALID');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.real_execution, false);
  assert.deepEqual(result.blockers, value.plan.blockers);
});

test('existing seed true or false yields bootstrap false and restores the canonical replay seed false', () => {
  for (const value of ['true', 'false']) {
    const plan = createBootstrapPlan(`${CANONICAL}\n[db.seed]\nenabled = ${value}\n`);
    assert.match(plan.bootstrapConfig, /\[db\.seed\]\s*\nenabled\s*=\s*false/);
    assert.match(plan.replayConfig, /\[db\.seed\]\s*\nenabled\s*=\s*false/);
    assert.equal((plan.bootstrapConfig.match(/\[db\.seed\]/g) ?? []).length, 1);
  }
});

test('unsupported config cannot introduce a remote, server setting or pre-enabled migrations', () => {
  for (const extra of [
    '\n[remotes.remote]\nproject_id = "remote"\n',
    '\n[db.settings]\nstatement_timeout = "0"\n',
    '\n[db.migrations]\nenabled = true\n',
    '\n[db.seed]\nsql_paths = ["seed.sql"]\n',
    '\n[functions.unknown]\nentrypoint = "remote.ts"\n',
    '\n[auth]\nenabled = true\n',
  ]) assert.throws(() => createBootstrapPlan(CANONICAL + extra));
});

test('duplicate or malformed config is rejected instead of silently applying precedence', () => {
  for (const text of [
    `project_id = "duplicate"\n${CANONICAL}`,
    `${CANONICAL}\n[functions.example]\nverify_jwt = false\n`,
    `${CANONICAL}\n[db.seed]\nenabled = false\nenabled = true\n`,
    CANONICAL.replace('verify_jwt = true', 'verify_jwt = "true"'),
    CANONICAL.replace('verify_jwt = true', 'verify_jwt = 1'),
    CANONICAL.replace('project_id = "fixture_local"', 'project_id = "../remote"'),
    '',
  ]) assert.throws(() => createBootstrapPlan(text));
});

test('fixture evidence cannot masquerade as real execution or carry invented registry verification', () => {
  for (const kind of [undefined, 'real', 'PASS', 'runtime']) rejectMutation(v => { v.evidence.kind = kind; });
  rejectMutation(v => { v.evidence.registryValidation = { registry: 'ghcr.io', verified: true, digest: 'a'.repeat(64) }; });
});

test('every phase is bound to the exact SHA, run, attempt, producer and nonce', () => {
  for (let phase = 0; phase < 7; phase++) {
    for (const [field, wrong] of [['sha', 'b'.repeat(40)], ['runId', '9000'], ['attempt', '2'],
      ['job', 'contracts'], ['nonce', '22222222-2222-4222-8222-222222222222']]) {
      rejectMutation(v => { v.evidence.phases[phase][field] = wrong; });
    }
  }
});

test('missing, duplicated or reordered phases cannot release the historical replay', () => {
  for (let phase = 0; phase < 7; phase++) rejectMutation(v => { v.evidence.phases.splice(phase, 1); });
  rejectMutation(v => { v.evidence.phases.splice(1, 0, structuredClone(v.evidence.phases[0])); });
  rejectMutation(v => { [v.evidence.phases[1], v.evidence.phases[2]] = [v.evidence.phases[2], v.evidence.phases[1]]; });
});

test('old, out-of-window and backwards timestamps block even when phases are named correctly', () => {
  rejectMutation(v => { v.evidence.phases[0].at = v.context.startedAt - 1; });
  rejectMutation(v => { v.evidence.phases[6].at = v.context.finishedAt + 1; });
  rejectMutation(v => { v.evidence.phases[3].at = v.evidence.phases[2].at - 1; });
  rejectMutation(v => { v.evidence.phases[0].at = '2000'; });
});

test('bootstrap config or command cannot apply history, use a remote target or omit the owned network', () => {
  rejectMutation(v => { v.evidence.phases[1].config = v.plan.replayConfig; });
  rejectMutation(v => { v.evidence.phases[1].config += '\n[db.migrations]\nenabled = true\n'; });
  rejectMutation(v => { v.evidence.phases[1].command = ['supabase', 'db', 'push']; });
  rejectMutation(v => { v.evidence.phases[1].command = v.plan.commands.bootstrap; });
  rejectMutation(v => { v.evidence.phases[1].command.push('--linked'); });
});

test('bootstrap must prove no applied history, no cron jobs and no application objects', () => {
  for (const [field, entry] of [['appliedVersions', '20260101000000'], ['cronJobs', 'historical-cron'], ['applicationObjects', 'public.organizations']]) {
    rejectMutation(v => { v.evidence.phases[1][field] = [entry]; });
    rejectMutation(v => { delete v.evidence.phases[1][field]; });
  }
});

test('both initial and final guards must deny every modeled route and retain local SQL access', () => {
  const fields = ['internal', 'ipv4_deny', 'ipv6_deny', 'dns_deny', 'host_gateway_deny',
    'auxiliaries_covered', 'native_processes_covered', 'local_sql_allowed', 'local_positive'];
  for (const index of [0, 5]) for (const field of fields) {
    rejectMutation(v => { v.evidence.phases[index].guard[field] = false; });
    rejectMutation(v => { delete v.evidence.phases[index].guard[field]; });
  }
});

test('a failed or absent local canary control cannot be interpreted as effective containment', () => {
  for (const index of [0, 5]) {
    rejectMutation(v => { v.evidence.phases[index].guard.external_canary_attempts = 0; });
    rejectMutation(v => { v.evidence.phases[index].guard.external_canary_receipts = 1; });
    rejectMutation(v => { v.evidence.phases[index].guard.policy_ids = []; });
    rejectMutation(v => { delete v.evidence.phases[index].guard.external_canary_receipts; });
  }
});

test('network identity changes after bootstrap block the transcript', () => {
  rejectMutation(v => { v.evidence.phases[0].networkId = 'not-an-id'; });
  rejectMutation(v => { v.evidence.phases[5].networkId = 'e'.repeat(64); });
  rejectMutation(v => { v.evidence.phases[0].networkName = 'preexisting'; });
});

test('Unicode structural whitespace is not silently interpreted as supported TOML', () => {
  for (const text of [CANONICAL.replace('project_id =', 'project_id\u00a0='),
    CANONICAL.replace('[functions.example]', '\u2028[functions.example]'),
    CANONICAL.replace('verify_jwt =', 'verify_jwt\u00a0=')]) assert.throws(() => createBootstrapPlan(text));
  assert.doesNotThrow(() => createBootstrapPlan('# comentario con acento: á\n' + CANONICAL));
});

test('completion timestamps cannot hide bootstrap or historical replay starting before its guard', () => {
  rejectMutation(v => { v.evidence.phases[1].startedAt = v.evidence.phases[0].at - 1; });
  rejectMutation(v => { v.evidence.phases[4].startedAt = v.evidence.phases[3].at - 1; });
  rejectMutation(v => { delete v.evidence.phases[1].startedAt; });
  rejectMutation(v => { v.evidence.phases[1].startedAt = v.evidence.phases[1].at + 1; });
});

test('cron must be a real modeled server GUC with off and no restart pending before release and at final checks', () => {
  for (const index of [2, 5]) {
    for (const [field, wrong] of [['name', 'client.cron'], ['setting', 'on'], ['source', 'session'],
      ['pending_restart', true], ['context', 'user']]) rejectMutation(v => { v.evidence.phases[index].guc[field] = wrong; });
    rejectMutation(v => { delete v.evidence.phases[index].guc; });
    rejectMutation(v => { v.evidence.phases[index].activeCronRuns = 1; });
  }
});

test('release requires exact canonical seed-disabled config and migration up --local', () => {
  rejectMutation(v => { v.evidence.phases[3].config = v.plan.bootstrapConfig; });
  rejectMutation(v => { v.evidence.phases[3].config = CANONICAL; });
  rejectMutation(v => { v.evidence.phases[3].command = ['supabase', 'migration', 'up', '--linked']; });
  rejectMutation(v => { v.evidence.phases[3].command.push('--include-all'); });
  rejectMutation(v => { v.evidence.phases[3].requestedVersions.reverse(); });
  rejectMutation(v => { v.evidence.phases[3].requestedVersions.pop(); });
});

test('exact Supabase versions reject omissions, extras, duplicate application and changed order', () => {
  rejectMutation(v => { v.evidence.phases[4].appliedVersions.pop(); });
  rejectMutation(v => { v.evidence.phases[4].appliedVersions.push('20260103000000'); });
  rejectMutation(v => { v.evidence.phases[4].appliedVersions.push(v.evidence.phases[4].appliedVersions[0]); });
  rejectMutation(v => { v.evidence.phases[4].appliedVersions.reverse(); });
});

test('Drizzle ledger and source manifests must remain byte-bound to the expected fixture inventory', () => {
  rejectMutation(v => { v.evidence.phases[4].drizzleLedger[0].hash = 'f'.repeat(64); });
  rejectMutation(v => { v.evidence.phases[4].drizzleLedger[0].created_at++; });
  rejectMutation(v => { v.evidence.phases[4].drizzleLedger.pop(); });
  rejectMutation(v => { v.evidence.phases[4].sourceManifest.supabase[0].sha256 = 'f'.repeat(64); });
  rejectMutation(v => { v.evidence.phases[4].sourceManifest.drizzle[0].path = 'other.sql'; });
  rejectMutation(v => { v.evidence.phases[4].sourceManifest.supabase.pop(); });
});

test('bootstrap and replay must preserve the same explicitly expected provider baseline', () => {
  for (const index of [1, 4]) for (const field of ['extensions', 'roles', 'schemas']) {
    rejectMutation(v => { v.evidence.phases[index].vendorBaseline[field].pop(); });
    rejectMutation(v => { v.evidence.phases[index].vendorBaseline[field].push('unexpected'); });
  }
});

test('cleanup must prove ownership, attempted successful stop and absence of all owned resources', () => {
  rejectMutation(v => { v.evidence.phases[6].ownershipVerified = false; });
  rejectMutation(v => { v.evidence.phases[6].stopAttempted = false; });
  rejectMutation(v => { v.evidence.phases[6].stopFailed = true; });
  for (const field of ['processes', 'containers', 'volumes', 'networks', 'namespaces', 'rules', 'canaries']) {
    rejectMutation(v => { v.evidence.phases[6].remaining[field] = ['remaining-owned-resource']; });
    rejectMutation(v => { delete v.evidence.phases[6].remaining[field]; });
  }
});

test('unknown phases and missing proof objects fail explicitly rather than giving a placeholder PASS', () => {
  rejectMutation(v => { v.evidence.phases[0].phase = 'unmodeled-network'; });
  rejectMutation(v => { delete v.evidence.phases[4].sourceManifest; });
  rejectMutation(v => { delete v.expected.vendorBaseline; });
  rejectMutation(v => { delete v.context.sha; });
});

test('an altered plan cannot silently admit a different bootstrap or migration command', () => {
  rejectMutation(v => { v.plan.bootstrapConfig = v.plan.replayConfig; });
  rejectMutation(v => { v.plan.commands.replay = ['supabase', 'db', 'push']; });
  rejectMutation(v => { v.plan.status = 'PASS'; });
  rejectMutation(v => { v.plan.real_execution = true; });
  rejectMutation(v => { v.plan.blockers = []; });
});

test('expected inventory must itself be internally coherent, canonical and complete', () => {
  rejectMutation(v => { v.expected.supabaseVersions.reverse(); });
  rejectMutation(v => { v.expected.supabaseVersions.push(v.expected.supabaseVersions[0]); });
  rejectMutation(v => { v.expected.sourceManifest.supabase[0].path = '../outside.sql'; });
  rejectMutation(v => { v.expected.sourceManifest.supabase[0].sha256 = 'unknown'; });
  rejectMutation(v => { v.expected.sourceManifest.supabase.push(structuredClone(v.expected.sourceManifest.supabase[0])); });
  rejectMutation(v => { v.expected.drizzleLedger[0].hash = '0'.repeat(64); });
  rejectMutation(v => { v.expected.drizzleLedger[1].created_at = v.expected.drizzleLedger[0].created_at; });
  rejectMutation(v => { v.expected.vendorBaseline.roles.push(v.expected.vendorBaseline.roles[0]); });
});
