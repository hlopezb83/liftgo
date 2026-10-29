import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { canonicalReplayManifest } from '../ci-drizzle-replay.mjs';
import { assessFixtureTranscript, buildBootstrapQueries, createCorePlan, profilePolicy, validateBinding } from '../lib/ephemeral-bootstrap-contract.mjs';

// All image/baseline values below are explicit synthetic fixtures, never runtime evidence.
const CANONICAL = 'project_id = "fixture_local"\n\n[functions.fixture]\nverify_jwt = true\n';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const EMPTY = () => Object.fromEntries(['processes', 'containers', 'volumes', 'networks', 'namespaces', 'rules', 'canaries'].map(key => [key, []]));
let drizzleSource;

function canonicalDrizzleSource() {
  if (!drizzleSource) {
    const manifest = canonicalReplayManifest(ROOT);
    const source = readdirSync(new URL('../../drizzle/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()
      .map(name => ({ path: 'drizzle/migrations/' + name, sha256: digest(readFileSync(new URL('../../drizzle/migrations/' + name, import.meta.url))) }));
    drizzleSource = { manifest, source };
  }
  return clone(drizzleSource);
}

function fixture(profile = 'rls') {
  const binding = { sha: 'a'.repeat(40), runId: '9001', attempt: '1', job: 'bootstrap_fixture', profile,
    nonce: '11111111-1111-4111-8111-111111111111' };
  const sourceManifest = { supabase: [
    { path: 'supabase/migrations/20260101000000_first.sql', sha256: '3'.repeat(64) },
    { path: 'supabase/migrations/20260102000000_second.sql', sha256: '4'.repeat(64) },
  ] };
  const actual = canonicalDrizzleSource();
  sourceManifest.drizzle = actual.source;
  const drizzleReplayManifest = actual.manifest, journalSha256 = actual.manifest.sourceJournalSha256;
  const plan = createCorePlan({ binding, canonicalConfig: CANONICAL, sourceManifest, journalSha256, drizzleReplayManifest });
  const images = plan.profile.requiredImageRoles.map((role, index) => ({ role,
    manifestDigest: 'sha256:' + digest('fixture-manifest-' + index),
    localImageId: 'sha256:' + digest('fixture-image-' + index), platform: 'linux/amd64' }));
  const inventory = { extensions: ['pg_cron', 'plpgsql'], roles: ['anon', 'authenticated', 'postgres', 'service_role'],
    schemas: ['auth', 'cron', 'public', 'storage'], objects: ['fixture-provider-object-hash'], routines: [], triggers: [], policies: [] };
  const presence = { supabaseLedger: true, drizzleLedger: false, cronJobs: true, cronRuns: true };
  const expected = { supabaseVersions: ['20260101000000', '20260102000000'],
    drizzleLedger: (drizzleReplayManifest?.migrations ?? []).map(row => ({ hash: row.sha256, created_at: row.when })), images,
    vendorBaseline: { approvalId: 'fixture-reference-only', profile, cliVersion: '2.34.0',
      bootstrapConfigSha256: plan.configDigests.bootstrap, imagesSha256: digest(images), inventorySha256: digest(inventory),
      presence, inventory } };
  const identity = { containerId: 'c'.repeat(64), volumeName: 'supabase_db_' + plan.projectId, dataDirectory: '/fixture/data' };
  const guc = { name: 'cron.launch_active_jobs', setting: 'off', source: 'configuration file',
    sourcefile: '/fixture/data/postgresql.auto.conf', pending_restart: false, context: 'sighup' };
  const guard = { networkName: plan.commands.bootstrap[3], networkId: 'd'.repeat(64), scopeProfile: profile,
    coveredServices: clone(plan.profile.requiredServices), includesFutureAuxiliaries: true, nativeCovered: true, dockerDnsCovered: true,
    controls: ['dns-udp', 'dns-tcp', 'ipv4', 'ipv6', 'host-gateway'].map(target => ({ target, positive: true, blocked: true,
      before: 4, after: 5, observerAlive: true, receiptsBefore: 1, receiptsAfter: 1 })) };
  const phase = (name, at, payload) => ({ phase: name, binding: clone(binding), at, ...payload });
  const evidence = { kind: 'fixture', binding: clone(binding), phases: [
    phase('containment', 1000, { guard: clone(guard) }),
    phase('bootstrap', 2000, { startedAt: 1500, configSha256: plan.configDigests.bootstrap, command: clone(plan.commands.bootstrap),
      identity: clone(identity), presence: clone(presence), appliedVersions: [], drizzleLedger: null, cronJobs: [], applicationObjects: [], inventory: clone(inventory) }),
    phase('cron-off', 3000, { guc: clone(guc), activeCronRuns: 0 }),
    phase('release', 4000, { configSha256: plan.configDigests.replay, command: clone(plan.commands.replay), requestedVersions: clone(expected.supabaseVersions) }),
    phase('replay', 5000, { startedAt: 4500,
      commands: clone([plan.commands.replay, plan.commands.drizzlePrepare, plan.commands.drizzleMigrate, plan.commands.drizzleVerify]),
      appliedVersions: clone(expected.supabaseVersions), drizzleLedger: clone(expected.drizzleLedger),
      sourceManifest: clone(plan.sourceManifest), baselineBeforeReplaySha256: expected.vendorBaseline.inventorySha256 }),
    phase('final-guards', 6000, { guard: clone(guard), guc: clone(guc), activeCronRuns: 0, identity: clone(identity) }),
    phase('cleanup', 7000, { ownershipVerified: true, stopAttempted: true, stopFailed: false, remaining: EMPTY() }),
  ] };
  return { plan, expected, evidence };
}

function rejects(name, mutate, profile = 'rls') {
  test(name, () => {
    const value = fixture(profile);
    assert.equal(assessFixtureTranscript(value).status, 'BLOCKED', 'Negative controls start from a coherent fixture');
    mutate(value);
    assert.throws(() => assessFixtureTranscript(value));
  });
}

for (const profile of ['catalog', 'rls', 'ab']) {
  test(`coherent ${profile} protocol remains a fixture and cannot release runtime`, () => {
    const value = fixture(profile), result = assessFixtureTranscript(value);
    assert.equal(result.contract, 'VALID');
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.real_execution, false);
    assert.equal(result.replay_authorized, false);
    assert.ok(result.blockers.includes('PRESTART_CONTAINMENT_UNIMPLEMENTED'));
    assert.equal(value.plan.configs.source, CANONICAL);
    assert.match(value.plan.configs.bootstrap, /\[db\.migrations\]\nenabled = false/);
    assert.match(value.plan.configs.bootstrap, /\[db\.seed\]\nenabled = false/);
    assert.doesNotMatch(value.plan.configs.replay, /\[db\.migrations\]/);
    assert.match(value.plan.configs.replay, /\[db\.seed\]\nenabled = false/);
  });
}

test('A/B preserves its API and Storage services while every profile preserves both migration lanes', () => {
  const ab = profilePolicy('ab'), rls = profilePolicy('rls');
  for (const service of ['kong', 'postgrest', 'storage-api']) {
    assert.ok(ab.requiredServices.includes(service));
    assert.ok(!ab.excludedServices.includes(service));
    assert.ok(rls.excludedServices.includes(service));
  }
  assert.deepEqual(ab.lanes, ['supabase', 'drizzle']);
  assert.deepEqual(rls.lanes, ['supabase', 'drizzle']);
  assert.deepEqual(profilePolicy('catalog').lanes, ['supabase', 'drizzle']);
  assert.ok(ab.requiredImageRoles.length > 4, 'The four minimal-profile image identities cannot cover A/B');
  assert.throws(() => profilePolicy('ab-minimal'));
});

test('canonical Drizzle source coverage preserves the current helper partition and its two receipts', () => {
  const value = fixture('catalog'), replay = value.plan.drizzleReplayManifest;
  assert.equal(value.plan.sourceManifest.drizzle.length, 123);
  assert.equal(replay.migrations.length, 121);
  assert.equal(replay.excludedReceipts.length, 2);
  assert.deepEqual(replay, canonicalReplayManifest(ROOT));
  assert.equal(value.expected.drizzleLedger.length, 121);
  assert.equal(assessFixtureTranscript(value).real_execution, false);
});

for (const profile of ['rls', 'ab']) {
  test(`${profile} current workflow source requires Drizzle prepare then migrate then verify`, () => {
    const workflowName = profile === 'rls' ? 'rls-db-tests.yml' : 'multi-tenant-ab.yml';
    const source = readFileSync(new URL('../../.github/workflows/' + workflowName, import.meta.url), 'utf8');
    const lines = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const required = ['bun scripts/ci-drizzle-replay.mjs prepare', 'bunx drizzle-kit migrate --config=drizzle.ci.config.ts',
      'bun scripts/ci-drizzle-replay.mjs verify'];
    const positions = required.map(command => {
      assert.equal(lines.filter(line => line === command).length, 1, `${workflowName} must contain one explicit ${command}`);
      return lines.indexOf(command);
    });
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], 'The source workflow changed its Drizzle sequence');
    const excluded = /supabase start\s*\\\n\s*-x ([a-z,-]+)/.exec(source)?.[1].split(',');
    assert.ok(excluded, 'Expected explicit Supabase service selection in the source workflow');
    for (const service of ['kong', 'postgrest', 'storage-api']) {
      assert.equal(excluded.includes(service), profile === 'rls', 'A/B API/Storage services must remain enabled');
    }
  });
  test(`${profile} requires the canonical Supabase and Drizzle command sequence and selected ledger`, () => {
    const value = fixture(profile);
    assert.deepEqual(value.evidence.phases[4].commands, [
      ['supabase', 'migration', 'up', '--local'],
      ['bun', 'scripts/ci-drizzle-replay.mjs', 'prepare'],
      ['bunx', 'drizzle-kit', 'migrate', '--config=drizzle.ci.config.ts'],
      ['bun', 'scripts/ci-drizzle-replay.mjs', 'verify'],
    ]);
    assert.equal(value.plan.sourceManifest.drizzle.length, 123);
    assert.equal(value.plan.drizzleReplayManifest.migrations.length, 121);
    assert.equal(value.plan.drizzleReplayManifest.excludedReceipts.length, 2);
    assert.deepEqual(value.expected.drizzleLedger, value.plan.drizzleReplayManifest.migrations
      .map(row => ({ hash: row.sha256, created_at: row.when })));
    assert.equal(assessFixtureTranscript(value).status, 'BLOCKED');
  });
  for (const [index, command] of ['Supabase migration', 'Drizzle preparation', 'Drizzle migration', 'Drizzle verification'].entries()) {
    rejects(`${profile} rejects omission of ${command}`, value => { value.evidence.phases[4].commands.splice(index, 1); }, profile);
  }
  rejects(`${profile} rejects commands present in the plan but omitted from replay evidence`, value => {
    delete value.evidence.phases[4].commands;
  }, profile);
  rejects(`${profile} rejects reordered replay commands`, value => {
    [value.evidence.phases[4].commands[1], value.evidence.phases[4].commands[2]] =
      [value.evidence.phases[4].commands[2], value.evidence.phases[4].commands[1]];
  }, profile);
  rejects(`${profile} cannot omit the selected Drizzle ledger`, value => { value.evidence.phases[4].drizzleLedger = []; }, profile);
  rejects(`${profile} cannot claim a changed Drizzle ledger hash`, value => { value.evidence.phases[4].drizzleLedger[0].hash = '9'.repeat(64); }, profile);
  rejects(`${profile} cannot omit the Drizzle source evidence`, value => { delete value.evidence.phases[4].sourceManifest.drizzle; }, profile);
}

test('an explicitly absent provider catalog uses null observations and still cannot authorize runtime', () => {
  const value = fixture('rls');
  const presence = { supabaseLedger: false, drizzleLedger: false, cronJobs: false, cronRuns: false };
  value.expected.vendorBaseline.presence = presence;
  Object.assign(value.evidence.phases[1], { presence: clone(presence), appliedVersions: null, drizzleLedger: null, cronJobs: null });
  value.evidence.phases[2].activeCronRuns = null;
  const result = assessFixtureTranscript(value);
  assert.equal(result.contract, 'VALID');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.real_execution, false);
});

for (const [presenceField, observationField] of [['supabaseLedger', 'appliedVersions'], ['drizzleLedger', 'drizzleLedger'], ['cronJobs', 'cronJobs']]) {
  rejects(`absent ${presenceField} cannot be represented as a successfully queried empty array`, value => {
    value.expected.vendorBaseline.presence[presenceField] = false;
    value.evidence.phases[1].presence[presenceField] = false;
    value.evidence.phases[1][observationField] = [];
  });
}

rejects('missing cron-run catalog cannot be reported as a zero-count query', value => {
  value.expected.vendorBaseline.presence.cronRuns = false;
  value.evidence.phases[1].presence.cronRuns = false;
  value.evidence.phases[2].activeCronRuns = 0;
});

test('unsupported configuration and duplicate structure fail closed rather than widening baseline tolerance', () => {
  const base = fixture('rls').plan;
  for (const extra of [
    '\n[db.settings]\nstatement_timeout = "0"\n',
    '\n[db.migrations]\nenabled = true\n',
    '\n[remotes.fixture]\nproject_id = "remote"\n',
    '\n[db.seed]\ncommand = "unreviewed"\n',
    '\nproject_id = "second"\n',
    '\n[functions.fixture]\nverify_jwt = false\n',
  ]) assert.throws(() => createCorePlan({ binding: base.binding, canonicalConfig: CANONICAL + extra,
    sourceManifest: base.sourceManifest, journalSha256: base.journalSha256, drizzleReplayManifest: base.drizzleReplayManifest }));
});

test('incomplete bindings or omitted/foreign migration lanes fail closed', () => {
  const value = fixture('rls');
  const binding = clone(value.plan.binding); delete binding.nonce;
  assert.throws(() => validateBinding(binding));
  const complete = { binding: value.plan.binding, canonicalConfig: CANONICAL, sourceManifest: value.plan.sourceManifest,
    journalSha256: value.plan.journalSha256, drizzleReplayManifest: value.plan.drizzleReplayManifest };
  assert.throws(() => createCorePlan({ ...complete, sourceManifest: { supabase: value.plan.sourceManifest.supabase } }));
  assert.throws(() => createCorePlan({ ...complete, sourceManifest: { ...value.plan.sourceManifest, remote: [] } }));
  assert.throws(() => createCorePlan({ ...complete, journalSha256: null }));
  assert.throws(() => createCorePlan({ ...complete, drizzleReplayManifest: null }));
});

for (const [field, changed] of Object.entries({ sha: 'b'.repeat(40), runId: '9002', attempt: '2', job: 'different_job',
  profile: 'ab', nonce: '22222222-2222-4222-8222-222222222222' })) {
  rejects(`a phase bound to another ${field} is rejected`, value => { value.evidence.phases[1].binding[field] = changed; });
}

rejects('a fixture cannot be relabeled as runtime evidence', value => { value.evidence.kind = 'real'; });
rejects('omitting any mandatory phase blocks the model', value => { value.evidence.phases.splice(2, 1); });
rejects('reordering phases cannot turn later checks into a prestart guard', value => {
  [value.evidence.phases[0], value.evidence.phases[1]] = [value.evidence.phases[1], value.evidence.phases[0]];
});
rejects('a bootstrap started before containment is rejected', value => { value.evidence.phases[1].startedAt = 999; });
rejects('an unmodeled statement/field cannot extend a phase contract', value => { value.evidence.phases[3].allowRemote = true; });
rejects('an altered plan cannot declare itself runnable', value => { value.plan.status = 'PASS'; value.plan.real_execution = true; });

rejects('a shallow baseline cannot prove absence of application objects', value => { delete value.expected.vendorBaseline.inventory.objects; });
rejects('a provider inventory mismatch is not accepted as the new baseline', value => {
  value.evidence.phases[1].inventory.objects.push('unexpected-application-object');
});
rejects('bootstrap application objects block release even if the rest of the fixture passes', value => {
  value.evidence.phases[1].applicationObjects.push('public.fixture_application_table');
});
rejects('bootstrap cron jobs block release', value => { value.evidence.phases[1].cronJobs.push('fixture-cron-job'); });
rejects('missing catalog observation is not an empty catalog', value => { delete value.evidence.phases[1].presence.cronJobs; });
rejects('unknown catalog presence cannot be approved by matching null values', value => {
  value.expected.vendorBaseline.presence.cronJobs = null; value.evidence.phases[1].presence.cronJobs = null;
});
rejects('changed image identity invalidates its provider reference', value => { value.expected.images[0].manifestDigest = 'sha256:' + '9'.repeat(64); });
rejects('A/B cannot silently omit Storage from containment', value => {
  value.evidence.phases[0].guard.coveredServices = value.evidence.phases[0].guard.coveredServices.filter(service => service !== 'storage-api');
}, 'ab');
rejects('future auxiliary coverage must remain explicit', value => { value.evidence.phases[0].guard.includesFutureAuxiliaries = false; });
rejects('each negative needs its own causal DROP increment', value => { value.evidence.phases[0].guard.controls[1].after = 4; });
rejects('a disconnected observer cannot prove blocking', value => { value.evidence.phases[0].guard.controls[0].observerAlive = false; });
rejects('receiving denied traffic blocks the model', value => { value.evidence.phases[0].guard.controls[3].receiptsAfter = 2; });
rejects('a failed positive control prevents an egress claim', value => { value.evidence.phases[0].guard.controls[2].positive = false; });

for (const [name, mutation] of [
  ['enabled scheduler', guc => { guc.setting = 'on'; }],
  ['client-only setting', guc => { guc.source = 'client'; }],
  ['foreign effective config file', guc => { guc.sourcefile = '/other/data/postgresql.auto.conf'; }],
  ['unapplied restart', guc => { guc.pending_restart = true; }],
]) rejects(`cron OFF rejects ${name}`, value => mutation(value.evidence.phases[2].guc));
rejects('active cron runs prevent release', value => { value.evidence.phases[2].activeCronRuns = 1; });
rejects('release must restore the exact seed-disabled replay config', value => { value.evidence.phases[3].configSha256 = value.plan.configDigests.bootstrap; });
rejects('linked migration execution cannot replace local migration up', value => { value.evidence.phases[3].command = ['supabase', 'migration', 'up', '--linked']; });
rejects('replay cannot start before release', value => { value.evidence.phases[4].startedAt = 3500; });
rejects('missing applied versions block completion', value => { value.evidence.phases[4].appliedVersions.pop(); });
rejects('extra applied versions block completion', value => { value.evidence.phases[4].appliedVersions.push('20260103000000'); });
rejects('reordered applied versions block completion', value => { value.evidence.phases[4].appliedVersions.reverse(); });
rejects('a changed replay source digest is rejected', value => { value.evidence.phases[4].sourceManifest.supabase[0].sha256 = '9'.repeat(64); });
rejects('a changed Drizzle ledger hash is rejected', value => { value.evidence.phases[4].drizzleLedger[0].hash = '9'.repeat(64); }, 'catalog');
rejects('a changed Drizzle ledger timestamp is rejected', value => { value.expected.drizzleLedger[0].created_at += 1; }, 'catalog');
rejects('final database identity must match the bootstrapped owned instance', value => { value.evidence.phases[5].identity.containerId = 'e'.repeat(64); });
rejects('cleanup failure cannot be hidden by a coherent replay', value => { value.evidence.phases[6].stopFailed = true; });
rejects('cleanup needs a complete inventory', value => { delete value.evidence.phases[6].remaining.rules; });
rejects('a surviving owned resource prevents success', value => { value.evidence.phases[6].remaining.namespaces.push('fixture-survivor'); });

test('the catalog manifest cannot hide source omissions, duplicate receipts or altered hashes', () => {
  const value = fixture('catalog');
  const planArgs = () => ({ binding: value.plan.binding, canonicalConfig: CANONICAL, sourceManifest: clone(value.plan.sourceManifest),
    journalSha256: value.plan.journalSha256, drizzleReplayManifest: clone(value.plan.drizzleReplayManifest) });
  const omitted = planArgs(); omitted.drizzleReplayManifest.excludedReceipts.pop();
  assert.throws(() => createCorePlan(omitted));
  const duplicate = planArgs(); duplicate.drizzleReplayManifest.excludedReceipts.push(clone(duplicate.drizzleReplayManifest.excludedReceipts[0]));
  assert.throws(() => createCorePlan(duplicate));
  const changed = planArgs(); changed.drizzleReplayManifest.excludedReceipts[0].sha256 = '9'.repeat(64);
  assert.throws(() => createCorePlan(changed));
  const missing = planArgs(); missing.sourceManifest.drizzle.pop();
  assert.throws(() => createCorePlan(missing));
});

test('query builders expose catalog observations and an unexecuted cron descriptor without executing SQL', () => {
  const queries = buildBootstrapQueries();
  for (const name of ['identity', 'presence', 'cronSettings', 'supabaseVersions', 'drizzleLedger', 'cronJobs',
    'activeCronRuns', 'extensions', 'roles', 'schemas', 'objects', 'routines', 'triggers', 'policies']) {
    assert.match(queries.readOnly[name], /^SELECT /);
    assert.doesNotMatch(queries.readOnly[name], /\b(?:ALTER|UPDATE|INSERT|DELETE|DROP|CREATE)\b/);
  }
  assert.equal(queries.cronDisable.executed, false);
  assert.equal(queries.cronDisable.requiresExplicitAuthorization, true);
  assert.equal(queries.cronDisable.target, 'owned-temporary-database-only');
});
