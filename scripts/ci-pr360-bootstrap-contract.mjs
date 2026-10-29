// OFFLINE CONTRACT ONLY. No process, SQL, network or runtime launcher is implemented here.
// A valid synthetic transcript remains BLOCKED and is never evidence for the CI gate.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const EXCLUDED = 'studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor,kong,postgrest';
const BLOCKERS = Object.freeze([
  'GHCR_IDENTITY_NOT_INTEGRATED',
  'RUNTIME_EGRESS_NOT_VERIFIED',
  'RUNTIME_BOOTSTRAP_EQUIVALENCE_NOT_VERIFIED',
  'RUNTIME_SCHEDULER_NOT_VERIFIED',
  'GATE_INTEGRATION_NOT_IMPLEMENTED',
]);
const PHASES = Object.freeze(['egress-before-start', 'bootstrap', 'cron-off', 'release', 'replay', 'final-guards', 'cleanup']);
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Deliberately bounded to the reviewed canonical config. New TOML syntax/keys fail
// until reviewed; this is not a TOML parser or a way to accept arbitrary remotes.
function canonicalConfig(text) {
  assert.equal(typeof text, 'string', 'Canonical config must be text');
  assert.ok(text.length && !text.includes('\r') && !text.includes('\0'), 'Unsupported config encoding');
  const rows = text.split('\n'), tables = new Set(), keys = new Set();
  let table = '', project = false, seedHeader = -1, seedEnabled = -1;
  for (const [index, row] of rows.entries()) {
    const line = row.replace(/^[ \t]+|[ \t]+$/g, '');
    if (!line || line.startsWith('#')) continue;
    assert.match(line.split('#', 1)[0], /^[\x20-\x7e\t]*$/, 'Unmodeled structural whitespace/characters');
    const header = /^\[(functions\.[a-z0-9_-]+|db\.seed)\]\s*(?:#.*)?$/.exec(line);
    if (header) {
      table = header[1];
      assert.ok(!tables.has(table), 'Duplicate config table');
      tables.add(table);
      if (table === 'db.seed') seedHeader = index;
      continue;
    }
    assert.ok(!line.startsWith('['), 'Unmodeled config table');
    if (!table) {
      assert.match(line, /^project_id\s*=\s*"[A-Za-z0-9_-]+"\s*(?:#.*)?$/, 'Unmodeled root config');
      assert.ok(!project, 'Duplicate project_id');
      project = true;
    } else {
      const field = /^(verify_jwt|enabled)\s*=\s*(true|false)\s*(?:#.*)?$/.exec(line);
      assert.ok(field, 'Unmodeled config field/value');
      assert.equal(field[1], table === 'db.seed' ? 'enabled' : 'verify_jwt', 'Unmodeled config field');
      const identity = table + '.' + field[1];
      assert.ok(!keys.has(identity), 'Duplicate config field');
      keys.add(identity);
      if (table === 'db.seed') seedEnabled = index;
    }
  }
  assert.ok(project, 'Missing project_id');
  return { rows, seedHeader, seedEnabled };
}

export function createBootstrapPlan(canonicalConfigText) {
  const { rows, seedHeader, seedEnabled } = canonicalConfig(canonicalConfigText);
  let replayConfig;
  if (seedHeader < 0) replayConfig = canonicalConfigText.trimEnd() + '\n\n[db.seed]\nenabled = false\n';
  else {
    if (seedEnabled < 0) rows.splice(seedHeader + 1, 0, 'enabled = false');
    else if (!/^\s*enabled\s*=\s*false\s*(?:#.*)?$/.test(rows[seedEnabled])) rows[seedEnabled] = 'enabled = false';
    replayConfig = rows.join('\n');
  }
  return {
    canonicalConfig: canonicalConfigText,
    bootstrapConfig: replayConfig.trimEnd() + '\n\n[db.migrations]\nenabled = false\n',
    replayConfig,
    commands: {
      bootstrap: ['supabase', 'start', '--network-id', '<owned-network-name>', '-x', EXCLUDED],
      replay: ['supabase', 'migration', 'up', '--local'],
    },
    status: 'BLOCKED', real_execution: false, blockers: [...BLOCKERS],
  };
}

function exactKeys(value, keys, message) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), message);
}
function integer(value, message) { assert.ok(Number.isSafeInteger(value) && value > 0, message); }
function list(value, message) { assert.ok(Array.isArray(value), message); return value; }
function sameBinding(phase, context) {
  for (const key of ['sha', 'runId', 'attempt', 'job', 'nonce']) assert.equal(phase[key], context[key], 'Foreign evidence: ' + key);
}
function cronOff(phase) {
  assert.deepEqual(phase.guc, { name: 'cron.launch_active_jobs', setting: 'off', source: 'configuration file',
    pending_restart: false, context: 'sighup' }, 'Server cron guard missing or not effective');
  assert.equal(phase.activeCronRuns, 0, 'Cron executed or remains active');
}
function networkGuard(phase) {
  assert.match(phase.networkId ?? '', HEX64, 'Missing owned network identity');
  assert.equal(phase.networkName, `liftgo_pr360_${phase.runId}_${phase.attempt}_${phase.nonce.slice(0,8)}`, 'Foreign network name');
  const guard = phase.guard;
  exactKeys(guard, ['internal', 'ipv4_deny', 'ipv6_deny', 'dns_deny', 'host_gateway_deny', 'auxiliaries_covered',
    'native_processes_covered', 'local_sql_allowed', 'local_positive', 'external_canary_attempts', 'external_canary_receipts', 'policy_ids'], 'Incomplete egress contract');
  for (const key of ['internal', 'ipv4_deny', 'ipv6_deny', 'dns_deny', 'host_gateway_deny', 'auxiliaries_covered',
    'native_processes_covered', 'local_sql_allowed', 'local_positive']) assert.equal(guard[key], true, 'Unproven egress property: ' + key);
  assert.ok(Number.isSafeInteger(guard.external_canary_attempts) && guard.external_canary_attempts > 0, 'Negative egress control missing');
  assert.equal(guard.external_canary_receipts, 0, 'Denied local canary received traffic');
  const ids = list(guard.policy_ids, 'Missing owned policies');
  assert.ok(ids.length && new Set(ids).size === ids.length && ids.every(id => /^[a-zA-Z0-9_-]+$/.test(id)), 'Invalid owned policies');
}
function manifest(entries, lane) {
  assert.ok(list(entries, 'Missing source manifest').length, 'Empty source manifest');
  const paths = [];
  for (const entry of entries) {
    exactKeys(entry, ['path', 'sha256'], 'Unknown source manifest fields');
    assert.match(entry.path, new RegExp('^' + lane + '/migrations/[A-Za-z0-9_-]+\\.sql$'), 'Unexpected migration path');
    assert.match(entry.sha256, HEX64, 'Missing source identity');
    paths.push(entry.path);
  }
  assert.deepEqual(paths, [...new Set(paths)].sort(), 'Source paths must be sorted and unique');
}

// This validates a MODEL, not measurements. Its name and return value intentionally
// prevent callers from representing synthetic data as an executable/runtime PASS.
export function verifyBootstrapFixture({ context, plan, expected, evidence }) {
  exactKeys(evidence, ['kind', 'phases'], 'Only an explicit fixture transcript is supported');
  assert.equal(evidence.kind, 'fixture', 'No runtime producer or attestation is implemented');
  exactKeys(context, ['sha', 'runId', 'attempt', 'job', 'nonce', 'startedAt', 'finishedAt'], 'Incomplete fixture context');
  assert.match(context.sha, /^[0-9a-f]{40}$/);
  assert.match(context.runId, /^[1-9][0-9]*$/); assert.match(context.attempt, /^[1-9][0-9]*$/);
  assert.equal(context.job, 'supabase-replay', 'Wrong fixture producer job');
  assert.match(context.nonce, UUID); integer(context.startedAt); integer(context.finishedAt);
  assert.ok(context.finishedAt > context.startedAt, 'Invalid fixture time window');
  assert.deepEqual(plan, createBootstrapPlan(plan?.canonicalConfig), 'Bootstrap plan was altered');
  exactKeys(expected, ['supabaseVersions', 'drizzleLedger', 'sourceManifest', 'vendorBaseline'], 'Incomplete expected baseline');
  const versions = list(expected.supabaseVersions, 'Missing expected versions');
  assert.ok(versions.length && versions.every(v => typeof v === 'string' && /^\d+$/.test(v)), 'Invalid expected versions');
  assert.deepEqual(versions, [...new Set(versions)].sort(), 'Expected versions must be sorted and unique');
  exactKeys(expected.sourceManifest, ['supabase', 'drizzle'], 'Incomplete expected manifests');
  for (const lane of ['supabase', 'drizzle']) manifest(expected.sourceManifest[lane], lane);
  assert.deepEqual(expected.sourceManifest.supabase.map(v => /\/(\d+)_/.exec(v.path)?.[1]), versions, 'Expected versions differ from sources');
  const ledger = list(expected.drizzleLedger, 'Missing expected Drizzle ledger');
  assert.equal(ledger.length, expected.sourceManifest.drizzle.length, 'Expected ledger/source count mismatch');
  const times = [];
  for (const [i, row] of ledger.entries()) {
    exactKeys(row, ['hash', 'created_at'], 'Unmodeled ledger'); assert.match(row.hash, HEX64); integer(row.created_at);
    assert.equal(row.hash, expected.sourceManifest.drizzle[i].sha256, 'Expected ledger differs from source identity'); times.push(row.created_at);
  }
  assert.deepEqual(times, [...new Set(times)].sort((a,b) => a-b), 'Expected ledger chronology is ambiguous');
  exactKeys(expected.vendorBaseline, ['extensions', 'roles', 'schemas'], 'Incomplete vendor baseline');
  for (const value of Object.values(expected.vendorBaseline)) {
    assert.ok(list(value, 'Missing vendor inventory').length && value.every(v => typeof v === 'string' && v.length), 'Empty vendor inventory');
    assert.deepEqual(value, [...new Set(value)].sort(), 'Vendor inventory must be sorted and unique');
  }
  const phases = list(evidence.phases, 'Missing bootstrap phases');
  assert.deepEqual(phases.map(p => p.phase), PHASES, 'Missing, duplicate or reordered bootstrap phase');
  let previous = context.startedAt;
  const common = ['phase', 'sha', 'runId', 'attempt', 'job', 'nonce', 'at'];
  const fields = [ ['networkId','networkName','guard'], ['startedAt','config','command','appliedVersions','cronJobs','applicationObjects','vendorBaseline'],
    ['guc','activeCronRuns'], ['config','command','requestedVersions'],
    ['startedAt','appliedVersions','drizzleLedger','sourceManifest','vendorBaseline'], ['networkId','networkName','guard','guc','activeCronRuns'],
    ['ownershipVerified','stopAttempted','stopFailed','remaining'] ];
  for (const [i, phase] of phases.entries()) {
    exactKeys(phase, [...common, ...fields[i]], 'Unmodeled or incomplete phase: ' + PHASES[i]);
    sameBinding(phase, context); integer(phase.at, 'Invalid evidence timestamp');
    assert.ok(phase.at > previous && phase.at <= context.finishedAt, 'Bootstrap phase ordering/time window violated'); previous = phase.at;
  }
  const [egress, bootstrap, cron, release, replay, final, cleanup] = phases;
  networkGuard(egress);
  integer(bootstrap.startedAt); integer(replay.startedAt);
  assert.ok(egress.at < bootstrap.startedAt && bootstrap.startedAt <= bootstrap.at, 'Egress was not established before bootstrap started');
  assert.ok(release.at < replay.startedAt && replay.startedAt <= replay.at, 'Historical replay started before release');
  assert.equal(bootstrap.config, plan.bootstrapConfig, 'Bootstrap might apply project history or seed');
  assert.deepEqual(bootstrap.command, plan.commands.bootstrap.map(v => v === '<owned-network-name>' ? egress.networkName : v), 'Bootstrap command bypass');
  for (const key of ['appliedVersions', 'cronJobs', 'applicationObjects']) assert.deepEqual(bootstrap[key], [], 'Bootstrap was not empty: ' + key);
  assert.deepEqual(bootstrap.vendorBaseline, expected.vendorBaseline, 'Unexpected provider baseline');
  cronOff(cron);
  assert.equal(release.config, plan.replayConfig, 'Canonical replay config was not restored');
  assert.deepEqual(release.command, ['supabase','migration','up','--local'], 'Replay must explicitly target local pending migrations');
  assert.deepEqual(release.requestedVersions, versions, 'Requested history is incomplete');
  assert.deepEqual(replay.appliedVersions, versions, 'Applied history has missing/extra/reordered versions');
  assert.deepEqual(replay.drizzleLedger, ledger, 'Drizzle ledger differs from canonical source');
  assert.deepEqual(replay.sourceManifest, expected.sourceManifest, 'Replay source identities changed');
  assert.deepEqual(replay.vendorBaseline, expected.vendorBaseline, 'Provider baseline changed');
  networkGuard(final); cronOff(final);
  assert.equal(final.networkId, egress.networkId, 'Network identity changed');
  assert.equal(final.networkName, egress.networkName, 'Network name changed');
  assert.deepEqual(final.guard, egress.guard, 'Egress guard changed');
  assert.equal(cleanup.ownershipVerified, true); assert.equal(cleanup.stopAttempted, true); assert.equal(cleanup.stopFailed, false);
  exactKeys(cleanup.remaining, ['processes','containers','volumes','networks','namespaces','rules','canaries'], 'Cleanup inventory incomplete');
  for (const [kind, values] of Object.entries(cleanup.remaining)) assert.deepEqual(values, [], 'Owned cleanup resources remain: ' + kind);
  return { contract: 'VALID', status: 'BLOCKED', real_execution: false, blockers: [...BLOCKERS] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  throw new Error('OFFLINE CONTRACT ONLY: runtime launcher, GHCR identities and containment are not integrated');
}
