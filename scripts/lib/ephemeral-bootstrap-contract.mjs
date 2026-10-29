// Pure phase contract. Fixtures never authorize CLI, network, server settings or SQL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBootstrapPlan } from '../ci-pr360-bootstrap-contract.mjs';

export const CORE_SCHEMA_VERSION = 1;
const PURPOSE = 'liftgo-ephemeral-bootstrap';
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BLOCKERS = Object.freeze(['PRESTART_CONTAINMENT_UNIMPLEMENTED', 'APPROVED_VENDOR_BASELINE_MISSING',
  'REAL_CRON_GUARD_UNVERIFIED', 'IMAGE_RUNTIME_UNVERIFIED', 'GATE_INTEGRATION_UNIMPLEMENTED']);
const EXCLUDED = ['studio', 'imgproxy', 'logflare', 'vector', 'edge-runtime', 'realtime', 'storage-api',
  'mailpit', 'postgres-meta', 'supavisor', 'kong', 'postgrest'];
const PHASES = ['containment', 'bootstrap', 'cron-off', 'release', 'replay', 'final-guards', 'cleanup'];
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const copy = value => structuredClone(value);
function keys(value, names, message) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), message);
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), message);
}
function orderedStrings(value, allowEmpty = false) {
  assert.ok(Array.isArray(value) && (allowEmpty || value.length), 'Missing inventory');
  assert.ok(value.every(v => typeof v === 'string' && v.length && !/[\0\r\n]/.test(v)), 'Invalid inventory value');
  assert.deepEqual(value, [...new Set(value)].sort(), 'Inventory must be sorted and unique');
}
function positive(value) { assert.ok(Number.isSafeInteger(value) && value > 0, 'Positive integer required'); }

export function profilePolicy(profile) {
  assert.ok(['catalog', 'rls', 'ab'].includes(profile), 'Unknown bootstrap profile');
  const ab = profile === 'ab';
  return { id: profile, requiredServices: ['postgres', 'gotrue', ...(ab ? ['kong', 'postgrest', 'storage-api'] : [])],
    requiredImageRoles: ['postgres', 'gotrue', 'realtime', 'storage-api', ...(ab ? ['kong', 'postgrest'] : [])],
    lanes: ['supabase', 'drizzle'],
    excludedServices: EXCLUDED.filter(v => !ab || !['kong', 'postgrest', 'storage-api'].includes(v)) };
}

export function validateBinding(binding) {
  keys(binding, ['sha', 'runId', 'attempt', 'job', 'profile', 'nonce'], 'Incomplete bootstrap binding');
  assert.match(binding.sha, /^[0-9a-f]{40}$/);
  for (const key of ['runId', 'attempt']) assert.match(binding[key], /^[1-9][0-9]*$/);
  assert.match(binding.job, /^[A-Za-z0-9_-]{1,100}$/);
  profilePolicy(binding.profile); assert.match(binding.nonce, UUID);
  return Object.fromEntries(['sha', 'runId', 'attempt', 'job', 'profile', 'nonce'].map(key => [key, binding[key]]));
}

function manifests(value, lanes) {
  keys(value, lanes, 'Source lanes differ from the profile');
  for (const lane of lanes) {
    assert.ok(Array.isArray(value[lane]) && value[lane].length, 'Empty source manifest');
    for (const row of value[lane]) {
      keys(row, ['path', 'sha256'], 'Unmodeled source entry');
      assert.match(row.path, new RegExp('^' + lane + '/migrations/[A-Za-z0-9_-]+\\.sql$'));
      assert.match(row.sha256, HEX64);
    }
    orderedStrings(value[lane].map(row => row.path));
  }
}

function drizzleManifest(manifest, sources, journalSha256) {
  keys(manifest, ['version', 'purpose', 'source', 'sourceJournalSha256', 'replayJournalSha256', 'excludedReceipts', 'migrations'], 'Incomplete canonical replay manifest');
  assert.equal(manifest.version, 1); assert.equal(manifest.purpose, 'local-ci-functional-replay');
  assert.equal(manifest.source, 'drizzle/migrations'); assert.equal(manifest.sourceJournalSha256, journalSha256);
  assert.match(manifest.replayJournalSha256, HEX64);
  assert.ok(Array.isArray(manifest.migrations) && manifest.migrations.length && Array.isArray(manifest.excludedReceipts), 'Missing replay partition');
  for (const row of manifest.migrations) {
    keys(row, ['idx', 'version', 'when', 'tag', 'breakpoints', 'sha256', 'bytes'], 'Unmodeled selected migration');
    assert.equal(row.version, '7'); assert.equal(typeof row.breakpoints, 'boolean');
    assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0, 'Invalid source byte count');
  }
  for (const row of manifest.excludedReceipts) {
    keys(row, ['idx', 'tag', 'when', 'sha256', 'reason'], 'Unmodeled canonical receipt');
    assert.ok(typeof row.reason === 'string' && row.reason.length, 'Missing canonical receipt reason');
  }
  const all = [...manifest.migrations, ...manifest.excludedReceipts].sort((a, b) => a.idx - b.idx);
  assert.equal(all.length, sources.length, 'Replay partition omits/adds a source');
  const paths = []; let previous = 0;
  for (const [index, row] of all.entries()) {
    assert.equal(row.idx, index, 'Canonical journal indexes must be complete and unique');
    assert.match(row.tag, /^[0-9]{4}_[A-Za-z0-9_-]+$/); assert.match(row.sha256, HEX64); positive(row.when);
    assert.ok(row.when > previous, 'Canonical journal chronology is ambiguous'); previous = row.when;
    paths.push({ path: 'drizzle/migrations/' + row.tag + '.sql', sha256: row.sha256 });
  }
  assert.deepEqual(paths, sources, 'Replay selected/excluded entries differ from complete source identities');
  assert.deepEqual(manifest.migrations.map(row => row.idx), [...manifest.migrations.map(row => row.idx)].sort((a, b) => a - b), 'Replay order changed');
  // This proves fixture consistency, not approval of an exclusion. The runtime
  // producer must recompute canonicalReplayManifest using the unchanged helper.
}

export function createCorePlan({ binding, canonicalConfig, sourceManifest, journalSha256, drizzleReplayManifest }) {
  const context = validateBinding(binding), profile = profilePolicy(context.profile);
  manifests(sourceManifest, profile.lanes);
  assert.match(journalSha256, HEX64); drizzleManifest(drizzleReplayManifest, sourceManifest.drizzle, journalSha256);
  createBootstrapPlan(canonicalConfig); // The existing bounded parser rejects unknown syntax/overrides.
  const suffix = sha256(context).slice(0, 24), projectId = `liftgo_ci_${context.profile}_${suffix}`;
  const owned = canonicalConfig.replace(/^[ \t]*project_id[ \t]*=[ \t]*"[A-Za-z0-9_-]+"[ \t]*(?:#.*)?$/m,
    `project_id = "${projectId}"`);
  const base = createBootstrapPlan(owned);
  const configs = { source: canonicalConfig, bootstrap: base.bootstrapConfig, replay: base.replayConfig };
  return { schema_version: CORE_SCHEMA_VERSION, purpose: PURPOSE, binding: context, projectId, profile,
    configs, configDigests: Object.fromEntries(Object.entries(configs).map(([key, text]) => [key, sha256(text)])),
    sourceManifest: copy(sourceManifest), journalSha256, drizzleReplayManifest: copy(drizzleReplayManifest),
    commands: { bootstrap: ['supabase', 'start', '--network-id', `liftgo_net_${context.profile}_${suffix}`,
      '-x', profile.excludedServices.join(',')], replay: ['supabase', 'migration', 'up', '--local'],
      drizzlePrepare: ['bun', 'scripts/ci-drizzle-replay.mjs', 'prepare'],
      drizzleMigrate: ['bunx', 'drizzle-kit', 'migrate', '--config=drizzle.ci.config.ts'],
      drizzleVerify: ['bun', 'scripts/ci-drizzle-replay.mjs', 'verify'] },
    status: 'BLOCKED', real_execution: false, blockers: [...BLOCKERS] };
}

export function buildBootstrapQueries() {
  return { readOnly: {
    identity: "SELECT current_database() AS database, current_user, session_user, inet_server_addr() AS server_address, current_setting('data_directory') AS data_directory, current_setting('server_version_num')::int AS server_version_num",
    presence: "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS supabase_ledger, to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle_ledger, to_regclass('cron.job') IS NOT NULL AS cron_jobs, to_regclass('cron.job_run_details') IS NOT NULL AS cron_runs",
    cronSettings: "SELECT name, setting, context, source, sourcefile, pending_restart FROM pg_settings WHERE name = 'cron.launch_active_jobs'",
    supabaseVersions: 'SELECT version::text AS version FROM supabase_migrations.schema_migrations ORDER BY version',
    drizzleLedger: 'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id',
    cronJobs: 'SELECT jobid::text AS jobid FROM cron.job ORDER BY jobid',
    activeCronRuns: "SELECT count(*)::int AS active FROM cron.job_run_details WHERE status IN ('starting','running')",
    extensions: 'SELECT extname, extversion FROM pg_extension ORDER BY extname',
    roles: 'SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls FROM pg_roles ORDER BY rolname',
    schemas: 'SELECT nspname, nspowner, nspacl FROM pg_namespace ORDER BY nspname',
    objects: "SELECT n.nspname, c.relname, c.relkind, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname,c.relkind",
    // Consumers hash definitions privately; raw query results must never become logs/artifacts.
    routines: "SELECT n.nspname, p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) AS identity_arguments, p.proowner, p.proacl, p.prosecdef, p.proconfig, p.prosrc, p.probin FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,p.proname,identity_arguments,p.prokind",
    triggers: "SELECT n.nspname, c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname,c.relname,t.tgname",
    policies: "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename,policyname",
  }, cronDisable: { target: 'owned-temporary-database-only', requiresExplicitAuthorization: true, executed: false,
    statements: ["ALTER SYSTEM SET cron.launch_active_jobs = 'off'", 'SELECT pg_reload_conf()'] } };
}

function baseline(expected, plan) {
  keys(expected, ['supabaseVersions', 'drizzleLedger', 'images', 'vendorBaseline'], 'Incomplete fixture baseline');
  const versions = plan.sourceManifest.supabase.map(row => /\/(\d+)_/.exec(row.path)?.[1]);
  orderedStrings(versions); assert.deepEqual(expected.supabaseVersions, versions, 'Versions differ from sources');
  assert.ok(Array.isArray(expected.images), 'Missing image identities');
  assert.deepEqual(expected.images.map(row => row.role), plan.profile.requiredImageRoles, 'Missing/extra profile image');
  for (const image of expected.images) {
    keys(image, ['role', 'manifestDigest', 'localImageId', 'platform'], 'Incomplete fixture image identity');
    assert.match(image.manifestDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(image.localImageId, /^sha256:[0-9a-f]{64}$/);
    assert.equal(image.platform, 'linux/amd64');
  }
  const vendor = expected.vendorBaseline;
  keys(vendor, ['approvalId', 'profile', 'cliVersion', 'bootstrapConfigSha256', 'imagesSha256', 'inventorySha256', 'presence', 'inventory'], 'Missing independent baseline reference');
  assert.match(vendor.approvalId, /^[A-Za-z0-9_-]{1,100}$/);
  assert.equal(vendor.profile, plan.binding.profile); assert.equal(vendor.cliVersion, '2.34.0');
  assert.equal(vendor.bootstrapConfigSha256, plan.configDigests.bootstrap);
  assert.equal(vendor.imagesSha256, sha256(expected.images), 'Baseline image identity changed');
  keys(vendor.inventory, ['extensions', 'roles', 'schemas', 'objects', 'routines', 'triggers', 'policies'], 'Incomplete provider inventory');
  for (const [name, values] of Object.entries(vendor.inventory)) orderedStrings(values, !['extensions', 'roles', 'schemas'].includes(name));
  assert.equal(vendor.inventorySha256, sha256(vendor.inventory), 'Provider inventory digest changed');
  keys(vendor.presence, ['supabaseLedger', 'drizzleLedger', 'cronJobs', 'cronRuns'], 'Catalog presence was not observed');
  assert.ok(Object.values(vendor.presence).every(value => typeof value === 'boolean'), 'Unknown catalog presence');
  assert.ok(Array.isArray(expected.drizzleLedger), 'Missing Drizzle ledger');
  const entries = plan.drizzleReplayManifest?.migrations ?? [];
  assert.equal(expected.drizzleLedger.length, entries.length, 'Wrong Drizzle lane/entry count');
  let previous = 0;
  for (const [i, row] of expected.drizzleLedger.entries()) {
    keys(row, ['hash', 'created_at'], 'Unmodeled Drizzle ledger');
    assert.equal(row.hash, entries[i].sha256, 'Drizzle source hash changed'); positive(row.created_at);
    assert.equal(row.created_at, entries[i].when, 'Drizzle ledger differs from the selected canonical timestamp');
    assert.ok(row.created_at > previous, 'Ambiguous Drizzle chronology'); previous = row.created_at;
  }
}

function identity(value, plan) {
  keys(value, ['containerId', 'volumeName', 'dataDirectory'], 'Owned database identity missing');
  assert.match(value.containerId, HEX64); assert.equal(value.volumeName, `supabase_db_${plan.projectId}`);
  assert.match(value.dataDirectory, /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/);
}
function cron(phase, owned, expectedActivity = 0) {
  assert.deepEqual(phase.guc, { name: 'cron.launch_active_jobs', setting: 'off', source: 'configuration file',
    sourcefile: owned.dataDirectory + '/postgresql.auto.conf', pending_restart: false, context: 'sighup' }, 'Server cron OFF is not effective in the owned file');
  assert.equal(phase.activeCronRuns, expectedActivity, 'Cron activity is not observed empty or explicitly absent');
}
function guard(value, plan) {
  keys(value, ['networkName', 'networkId', 'scopeProfile', 'coveredServices', 'includesFutureAuxiliaries',
    'nativeCovered', 'dockerDnsCovered', 'controls'], 'Incomplete fixture containment scope');
  assert.equal(value.networkName, plan.commands.bootstrap[3]); assert.match(value.networkId, HEX64);
  assert.equal(value.scopeProfile, plan.binding.profile);
  assert.deepEqual(value.coveredServices, plan.profile.requiredServices, 'Profile services were dropped');
  for (const field of ['includesFutureAuxiliaries', 'nativeCovered', 'dockerDnsCovered']) assert.equal(value[field], true, 'Unmodeled containment coverage');
  assert.ok(Array.isArray(value.controls), 'Missing local controls');
  assert.deepEqual(value.controls.map(row => row.target), ['dns-udp', 'dns-tcp', 'ipv4', 'ipv6', 'host-gateway']);
  for (const row of value.controls) {
    keys(row, ['target', 'positive', 'blocked', 'before', 'after', 'observerAlive', 'receiptsBefore', 'receiptsAfter'], 'Incomplete causal control');
    for (const field of ['positive', 'blocked', 'observerAlive']) assert.equal(row[field], true, 'A fixture control failed');
    assert.ok(Number.isSafeInteger(row.before) && row.before >= 0 && Number.isSafeInteger(row.after) && row.after > row.before, 'No individual DROP delta');
    positive(row.receiptsBefore); assert.equal(row.receiptsAfter, row.receiptsBefore, 'Observer received denied traffic');
  }
}

export function assessFixtureTranscript({ plan, expected, evidence }) {
  assert.deepEqual(plan, createCorePlan({ binding: plan?.binding, canonicalConfig: plan?.configs?.source,
    sourceManifest: plan?.sourceManifest, journalSha256: plan?.journalSha256,
    drizzleReplayManifest: plan?.drizzleReplayManifest }), 'Core plan was altered');
  baseline(expected, plan);
  keys(evidence, ['kind', 'binding', 'phases'], 'Only an explicit fixture transcript is supported');
  assert.equal(evidence.kind, 'fixture', 'No runtime containment capability is implemented');
  assert.deepEqual(validateBinding(evidence.binding), plan.binding, 'Foreign fixture transcript');
  assert.ok(Array.isArray(evidence.phases), 'Missing fixture phases');
  assert.deepEqual(evidence.phases.map(row => row.phase), PHASES, 'Missing, duplicate or reordered phase');
  const payloads = [['guard'], ['startedAt', 'configSha256', 'command', 'identity', 'presence', 'appliedVersions', 'drizzleLedger', 'cronJobs', 'applicationObjects', 'inventory'],
    ['guc', 'activeCronRuns'], ['configSha256', 'command', 'requestedVersions'],
    ['startedAt', 'commands', 'appliedVersions', 'drizzleLedger', 'sourceManifest', 'baselineBeforeReplaySha256'],
    ['guard', 'guc', 'activeCronRuns', 'identity'], ['ownershipVerified', 'stopAttempted', 'stopFailed', 'remaining']];
  let previous = 0;
  for (const [i, phase] of evidence.phases.entries()) {
    keys(phase, ['phase', 'binding', 'at', ...payloads[i]], 'Unknown or incomplete phase payload');
    assert.deepEqual(validateBinding(phase.binding), plan.binding, 'Foreign phase binding'); positive(phase.at);
    assert.ok(phase.at > previous, 'Non-monotonic phase chronology'); previous = phase.at;
  }
  const [contained, boot, disabled, released, replayed, final, cleaned] = evidence.phases;
  guard(contained.guard, plan); identity(boot.identity, plan);
  positive(boot.startedAt); assert.ok(contained.at < boot.startedAt && boot.startedAt <= boot.at, 'Containment was not before bootstrap');
  assert.equal(boot.configSha256, plan.configDigests.bootstrap); assert.deepEqual(boot.command, plan.commands.bootstrap);
  assert.deepEqual(boot.presence, expected.vendorBaseline.presence, 'Missing catalog cannot be treated as empty');
  for (const [field, present] of [['appliedVersions', boot.presence.supabaseLedger], ['drizzleLedger', boot.presence.drizzleLedger], ['cronJobs', boot.presence.cronJobs]]) {
    assert.deepEqual(boot[field], present ? [] : null, 'Absent catalog cannot be represented as queried empty rows');
  }
  assert.deepEqual(boot.applicationObjects, [], 'Bootstrap contains application objects');
  assert.deepEqual(boot.inventory, expected.vendorBaseline.inventory, 'Provider baseline differs from the independent reference');
  cron(disabled, boot.identity, boot.presence.cronRuns ? 0 : null);
  assert.equal(released.configSha256, plan.configDigests.replay); assert.deepEqual(released.command, plan.commands.replay);
  assert.deepEqual(released.requestedVersions, expected.supabaseVersions);
  positive(replayed.startedAt); assert.ok(released.at < replayed.startedAt && replayed.startedAt <= replayed.at, 'Replay started before release');
  assert.deepEqual(replayed.commands, [plan.commands.replay, plan.commands.drizzlePrepare,
    plan.commands.drizzleMigrate, plan.commands.drizzleVerify], 'Supabase/Drizzle replay sequence differs or omits a required step');
  assert.deepEqual(replayed.appliedVersions, expected.supabaseVersions); assert.deepEqual(replayed.drizzleLedger, expected.drizzleLedger);
  assert.deepEqual(replayed.sourceManifest, plan.sourceManifest); assert.equal(replayed.baselineBeforeReplaySha256, expected.vendorBaseline.inventorySha256);
  guard(final.guard, plan); assert.deepEqual(final.guard, contained.guard, 'Containment changed');
  assert.deepEqual(final.identity, boot.identity, 'Owned database changed'); cron(final, boot.identity);
  assert.equal(cleaned.ownershipVerified, true); assert.equal(cleaned.stopAttempted, true); assert.equal(cleaned.stopFailed, false);
  keys(cleaned.remaining, ['processes', 'containers', 'volumes', 'networks', 'namespaces', 'rules', 'canaries'], 'Incomplete cleanup inventory');
  for (const resources of Object.values(cleaned.remaining)) assert.deepEqual(resources, [], 'Owned resources remain');
  return { schema_version: CORE_SCHEMA_VERSION, contract: 'VALID', status: 'BLOCKED', real_execution: false,
    replay_authorized: false, blockers: [...BLOCKERS] };
}
