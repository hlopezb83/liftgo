import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareIsolatedDockerSession, startIsolatedDockerSession, inspectIsolatedDockerSession, cleanupIsolatedDockerSession } from '../lib/isolated-docker-session.mjs';
function fixture(profile = 'catalog') {
  const binding = { sha: 'a'.repeat(40), runId: '9', attempt: '1', job: 'supabase-replay', profile, nonce: '11111111-1111-4111-8111-111111111111' };
  const calls = [], outer = {}, backend = {}, pin = {}, data = { createFails: false, startFails: false, cleanupFails: false, outerCleanupFails: false, privatePending: null,
    outer: { binding, status: 'BOUNDARY_READY', owner: { anchor: { namespaceInode: 202 } }, runtime_authorized: false },
    docker: { binding, status: 'PRIVATE_DAEMONS_OBSERVED', namespaceInode: 202, bridge: 'normal', replay_authorized: false } };
  const drivers = {
    async createOuterNetworkSession(value) { calls.push('outer-create'); assert.deepEqual(value.binding, binding); return outer; },
    outerNetworkPin(value) { assert.equal(value, outer); calls.push('pin'); return pin; },
    inspectOuterNetworkSession(value) { assert.equal(value, outer); calls.push('outer-inspect'); return structuredClone(data.outer); },
    async cleanupOuterNetworkSession(value) { assert.equal(value, outer); calls.push('outer-cleanup'); if (data.outerCleanupFails) throw new Error('private output'); return { status: 'ANCHOR_AND_FD_CLOSED', full_cleanup_verified: false }; },
    createPrivateDockerBackend(value) { calls.push('backend-create'); assert.equal(value.pin, pin); assert.deepEqual(value.binding, binding); if (data.createFails) {
      const error = new Error('private output'); error.pending_resources = data.privatePending; throw error;
    } return backend; },
    async startPrivateDockerBackend(value) { assert.equal(value, backend); calls.push('backend-start'); if (data.startFails) throw new Error('private output'); return structuredClone(data.docker); },
    inspectPrivateDockerBackend(value) { assert.equal(value, backend); calls.push('backend-inspect'); return structuredClone(data.docker); },
    async cleanupPrivateDockerBackend(value) { assert.equal(value, backend); calls.push('backend-cleanup'); if (data.cleanupFails) {
      const error = new Error('private output'); error.pending_resources = data.privatePending; throw error;
    } return { status: 'PRIVATE_DAEMONS_CLEANED', binding, replay_authorized: false }; },
  };
  return { binding, calls, data, drivers, prepare: () => prepareIsolatedDockerSession({ binding, runnerTemp: '/tmp/private', toolchain: {} }, { testDrivers: drivers }) };
}
for (const profile of ['catalog', 'rls', 'ab']) test(`${profile}: real composition uses the same owned pin, normal bridge and reverse cleanup`, async () => {
  const f = fixture(profile), cap = await f.prepare(), result = await startIsolatedDockerSession(cap);
  assert.equal(result.kind, 'fixture'); assert.equal(result.sql_authorized, false); assert.equal(result.runtime_validated, false);
  assert.equal(inspectIsolatedDockerSession(cap).docker.namespaceInode, 202);
  const cleanup = await cleanupIsolatedDockerSession(cap);
  assert.equal(cleanup.full_cleanup_verified, false); assert.equal(cleanup.sql_authorized, false);
  assert.ok(f.calls.indexOf('outer-create') < f.calls.indexOf('backend-create'));
  assert.ok(f.calls.indexOf('backend-cleanup') < f.calls.indexOf('outer-cleanup'));
  await assert.rejects(startIsolatedDockerSession(cap), /PHASE_INVALID/);
});
test('failed daemon start retains cleanup ownership without granting a session', async () => {
  const f = fixture(), cap = await f.prepare(); f.data.startFails = true;
  await assert.rejects(startIsolatedDockerSession(cap), /START_FAILED_CLEANUP_REQUIRED/);
  await cleanupIsolatedDockerSession(cap); assert.equal(f.calls.includes('outer-cleanup'), true);
});
test('private cleanup failure preserves the outer anchor and remains sticky', async () => {
  const f = fixture(), cap = await f.prepare(); f.data.cleanupFails = true;
  f.data.privatePending = { phase: 'cleanup-failed', rollbackUnproven: true,
    directory: { path: '/tmp/private/docker-owned', inode: 501 }, cgroup: { path: '/sys/fs/cgroup/liftgo-owned', inode: 502 } };
  await assert.rejects(cleanupIsolatedDockerSession(cap), error => {
    assert.deepEqual(error.pending_resources, { privateCleanupObserved: false, outerAnchorCleanupUnproven: true, privateResources: f.data.privatePending });
    assert.equal(error.code, 'ISOLATED_DOCKER_CLEANUP_UNPROVEN'); return true;
  });
  assert.equal(f.calls.includes('outer-cleanup'), false); f.data.cleanupFails = false;
  await assert.rejects(cleanupIsolatedDockerSession(cap), /PHASE_INVALID/);
});
test('outer cleanup failure cannot turn component cleanup into a full PASS', async () => {
  const f = fixture(), cap = await f.prepare(); f.data.outerCleanupFails = true;
  await assert.rejects(cleanupIsolatedDockerSession(cap), /CLEANUP_UNPROVEN/);
});
test('failed private preparation reports resource uncertainty and retires the inert anchor', async () => {
  const f = fixture(); f.data.createFails = true;
  await assert.rejects(f.prepare(), error => error.code === 'ISOLATED_SESSION_PREPARATION_FAILED' &&
    error.pending_resources.privatePreparationUnproven === true && !error.message.includes('private output'));
  assert.equal(f.calls.includes('outer-cleanup'), true); assert.equal(f.calls.includes('backend-start'), false);
});
test('partial private rollback preserves exact owned resource metadata without making a capability', async () => {
  const f = fixture(); f.data.createFails = true;
  f.data.privatePending = { phase: 'prepare-failed', rollbackUnproven: true,
    directory: { path: '/tmp/private/docker-owned', inode: 501 }, cgroup: { path: '/sys/fs/cgroup/liftgo-owned', inode: 502 } };
  await assert.rejects(f.prepare(), error => {
    assert.deepEqual(error.pending_resources.privateResources, f.data.privatePending);
    assert.equal(error.pending_resources.anchorCleanupUnproven, false); return true;
  });
  await assert.rejects(startIsolatedDockerSession(f.data.privatePending), /PHASE_INVALID/);
});
for (const [name, mutate] of [
  ['foreign SHA', f => { f.data.docker.binding = { ...f.binding, sha: 'b'.repeat(40) }; }],
  ['foreign profile', f => { f.data.docker.binding = { ...f.binding, profile: 'ab' }; }],
  ['foreign run', f => { f.data.outer.binding = { ...f.binding, runId: '10' }; }],
  ['namespace mismatch', f => { f.data.docker.namespaceInode = 303; }],
  ['internal bridge', f => { f.data.docker.bridge = 'internal'; }],
  ['invented replay grant', f => { f.data.docker.replay_authorized = true; }],
]) test(`observations reject ${name} and cannot revive`, async () => {
  const f = fixture(), cap = await f.prepare(); await startIsolatedDockerSession(cap); mutate(f);
  assert.throws(() => inspectIsolatedDockerSession(cap), /OBSERVATION_FAILED/);
  f.data.docker = { binding: f.binding, status: 'PRIVATE_DAEMONS_OBSERVED', namespaceInode: 202, bridge: 'normal', replay_authorized: false };
  assert.throws(() => inspectIsolatedDockerSession(cap), /PHASE_INVALID/);
});
test('serialized JSON never recovers a running backend or authorizes commands', async () => {
  const f = fixture(), cap = await f.prepare(), foreign = JSON.parse(JSON.stringify(cap));
  await assert.rejects(startIsolatedDockerSession(foreign), /PHASE_INVALID/);
  assert.throws(() => inspectIsolatedDockerSession(foreign), /PHASE_INVALID/);
  await assert.rejects(cleanupIsolatedDockerSession(foreign), /PHASE_INVALID/);
  await cleanupIsolatedDockerSession(cap);
});
test('partial test drivers are rejected without falling back to default infrastructure', async () => {
  const f = fixture();
  await assert.rejects(prepareIsolatedDockerSession({ binding: f.binding }, { testDrivers: { createOuterNetworkSession: f.drivers.createOuterNetworkSession } }), /PAIR_ALL/);
  assert.equal(f.calls.length, 0);
});
