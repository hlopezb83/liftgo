import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOuterNetworkSession, outerNetworkPin, inspectOuterNetworkSession, cleanupOuterNetworkSession } from '../lib/outer-network-session.mjs';

const binding = { sha: 'a'.repeat(40), runId: '9001', attempt: '1', job: 'supabase-replay', profile: 'catalog', nonce: '11111111-1111-4111-8111-111111111111' };
function fixture(profile = 'catalog') {
  const context = { ...binding, profile }, calls = [], pin = Object.freeze({ mock: true });
  const data = { pid: 4201, host: 101, ppid: 8100, startTicks: '99', namespaceInode: 202,
    argv: ['/node', '/owned/outer-network-session.mjs', '__bootstrap_anchor', context.nonce],
    message: { event: 'ready', pid: 4201, nonce: context.nonce, lifetimeMs: 720000 },
    exit: { code: 0, signal: null, error: false }, closeError: false, identityError: false, boundaryError: false,
    boundary: { status: 'BOUNDARY_OBSERVED', runtime_authorized: false }, launched: false, loopbackError: false,
    loopback: { status: 'LOOPBACK_UP', interfaces: ['lo'] } };
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const ports = {
    launch(value) { calls.push(['launch', structuredClone(value)]); data.launched = true;
      return { pid: data.pid, ready: Promise.resolve(data.message), finished,
        stop() { calls.push(['stop']); finish(data.exit); }, disconnect() { calls.push(['disconnect']); } }; },
    identity(pid) { calls.push(['identity', pid]); if (data.identityError) throw new Error('private child output');
      return { pid: data.pid, ppid: data.ppid, startTicks: data.startTicks, namespaceInode: data.namespaceInode, argv: [...data.argv] }; },
    hostInode() { calls.push(['host']); return data.host; }, parentPid() { return 8100; },
    pin(owner) { calls.push(['pin', structuredClone(owner)]); return pin; },
    observe(value) { assert.equal(value, pin); calls.push(['observe']); if (data.boundaryError) throw new Error('private child output'); return data.boundary; },
    activateLoopback(value) { assert.equal(value, pin); calls.push(['loopback-up']); if (data.loopbackError) throw new Error('private child output'); return data.loopback; },
    close(value) { assert.equal(value, pin); calls.push(['close']); if (data.closeError) throw new Error('private child output'); return { status: 'CLOSED' }; },
  };
  return { context, data, calls, pin, ports, options: { testDrivers: ports }, finish,
    create: () => createOuterNetworkSession({ binding: context }, { testDrivers: ports }) };
}

for (const profile of ['catalog', 'rls', 'ab']) test(`${profile}: all operations are mocked; no runtime/SQL authorization`, async () => {
  const f = fixture(profile), cap = await f.create();
  assert.equal(Object.isFrozen(cap), true); assert.equal(cap.runtime_authorized, false);
  assert.equal(outerNetworkPin(cap), f.pin);
  const result = inspectOuterNetworkSession(cap);
  assert.equal(result.status, 'BOUNDARY_READY'); assert.equal(result.sql_authorized, false);
  assert.equal(result.real_execution, false); assert.deepEqual(result.binding, f.context);
  assert.ok(f.calls.findIndex(c => c[0] === 'pin') < f.calls.findIndex(c => c[0] === 'observe'));
  assert.deepEqual(f.calls.find(c => c[0] === 'pin')[1], { binding: f.context,
    anchor: { pid: 4201, startTicks: '99', namespaceInode: 202 }, hostNamespaceInode: 101 });
  assert.deepEqual(await cleanupOuterNetworkSession(cap), { status: 'ANCHOR_AND_FD_CLOSED', full_cleanup_verified: false, sql_authorized: false });
  assert.ok(f.calls.findIndex(c => c[0] === 'stop') < f.calls.findIndex(c => c[0] === 'close'));
  assert.throws(() => outerNetworkPin(cap), /NOT_LIVE/);
  await cleanupOuterNetworkSession(cap); assert.equal(f.calls.filter(c => c[0] === 'stop').length, 1);
});

for (const [name, mutate] of [
  ['host namespace', f => { f.data.namespaceInode = f.data.host; }],
  ['foreign parent', f => { f.data.ppid = 9; }],
  ['foreign nonce', f => { f.data.argv[3] = '22222222-2222-4222-8222-222222222222'; }],
  ['foreign handshake', f => { f.data.message.nonce = '22222222-2222-4222-8222-222222222222'; }],
  ['wrong handshake pid', f => { f.data.message.pid = 999; }],
  ['wrong lifetime', f => { f.data.message.lifetimeMs = 900000; }],
  ['extra handshake field', f => { f.data.message.override = true; }],
  ['missing marker', f => { f.data.argv[2] = '__wrong_marker'; }],
  ['identity read fails', f => { f.data.identityError = true; }],
  ['boundary read fails', f => { f.data.boundaryError = true; }],
  ['boundary status absent', f => { f.data.boundary = {}; }],
  ['invented runtime grant', f => { f.data.boundary.runtime_authorized = true; }],
  ['loopback up command failed', f => { f.data.loopbackError = true; }],
  ['loopback up not observed', f => { f.data.loopback = {}; }],
]) test(`acquisition rejects ${name}, disconnects and never exposes a capability`, async () => {
  const f = fixture(); mutate(f);
  await assert.rejects(f.create(), error => error.code === 'OUTER_SESSION_ACQUISITION_FAILED' && !error.message.includes('private child output'));
  assert.equal(f.calls.some(c => c[0] === 'disconnect'), true);
  assert.equal(f.calls.some(c => c[0] === 'stop'), false);
  if (f.calls.some(c => c[0] === 'pin')) assert.equal(f.calls.some(c => c[0] === 'close'), true);
});

for (const [name, mutate] of [
  ['PID reuse', f => { f.data.startTicks = '100'; }],
  ['namespace replaced', f => { f.data.namespaceInode = 203; }],
  ['supervisor moved', f => { f.data.host = 102; }],
  ['nonce replaced', f => { f.data.argv[3] = '22222222-2222-4222-8222-222222222222'; }],
]) test(`a live session rejects ${name} and cannot claim cleanup`, async () => {
  const f = fixture(), cap = await f.create(); mutate(f);
  assert.throws(() => inspectOuterNetworkSession(cap), /CHANGED/);
  assert.throws(() => outerNetworkPin(cap), /NOT_LIVE/);
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
  assert.equal(f.calls.some(c => c[0] === 'stop'), false);
  assert.equal(f.calls.some(c => c[0] === 'close'), false);
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
});

for (const [name, exit] of [
  ['nonzero exit', { code: 72, signal: null, error: false }],
  ['signal death', { code: null, signal: 'SIGTERM', error: false }],
  ['launch error', { code: null, signal: null, error: true }],
]) test(`cleanup rejects ${name} and remains failed`, async () => {
  const f = fixture(), cap = await f.create(); f.data.exit = exit;
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
  assert.equal(f.calls.some(c => c[0] === 'close'), false);
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
});

test('descriptor closure error is sticky and never becomes CLOSED on retry', async () => {
  const f = fixture(), cap = await f.create(); f.data.closeError = true;
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
  f.data.closeError = false;
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
  assert.equal(f.calls.filter(c => c[0] === 'close').length, 1);
});

test('serialized and arbitrary objects cannot recover a namespace capability', async () => {
  const f = fixture(), cap = await f.create();
  for (const foreign of [{}, JSON.parse(JSON.stringify(cap)), Object.freeze({ kind: 'OUTER_NETWORK_SESSION', runtime_authorized: false })]) {
    assert.throws(() => outerNetworkPin(foreign), /NOT_LIVE/);
    assert.throws(() => inspectOuterNetworkSession(foreign), /NOT_LIVE/);
    await assert.rejects(cleanupOuterNetworkSession(foreign), /UNMINTED/);
  }
  await cleanupOuterNetworkSession(cap);
});

test('snapshot edits do not change ownership or binding', async () => {
  const f = fixture(), cap = await f.create(), first = inspectOuterNetworkSession(cap);
  first.owner.anchor.startTicks = '900'; first.binding.sha = 'f'.repeat(40);
  assert.equal(inspectOuterNetworkSession(cap).owner.anchor.startTicks, '99');
  assert.equal(inspectOuterNetworkSession(cap).binding.sha, binding.sha);
  await cleanupOuterNetworkSession(cap);
});

test('partial mocks and unknown overrides are rejected before a process is launched', async () => {
  const f = fixture();
  for (const options of [null, [], { testDrivers: { launch: f.ports.launch } }, { launch: f.ports.launch }, { testDrivers: f.ports, extra: true }])
    await assert.rejects(createOuterNetworkSession({ binding }, options), /DRIVERS/);
  assert.equal(f.data.launched, false);
});

test('invalid binding blocks before even a mocked host lookup', async () => {
  const f = fixture();
  await assert.rejects(createOuterNetworkSession({ binding: { ...binding, profile: 'unknown' } }, f.options));
  assert.equal(f.calls.length, 0);
});

test('ready timeout disconnects, reports a pending anchor and never claims cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), original = f.ports.launch;
  f.ports.launch = value => ({ ...original(value), ready: new Promise(() => {}) });
  const pending = f.create();
  t.mock.timers.tick(10_001);
  await assert.rejects(pending, error => error.code === 'OUTER_SESSION_ACQUISITION_FAILED' &&
    error.pending_resources.anchorExitUnproven === true && error.pending_resources.anchorPid === 4201);
  assert.equal(f.calls.some(c => c[0] === 'disconnect'), true);
  assert.equal(f.calls.some(c => c[0] === 'pin'), false);
});

test('cleanup timeout is sticky, preserves FD ownership uncertainty and never kills a PID', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), original = f.ports.launch;
  f.ports.launch = value => ({ ...original(value), finished: new Promise(() => {}) });
  const cap = await f.create(), pending = cleanupOuterNetworkSession(cap);
  t.mock.timers.tick(20_001);
  await assert.rejects(pending, /OUTER_CLEANUP_UNPROVEN/);
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
  assert.equal(f.calls.some(c => c[0] === 'close'), false);
});

test('a later restored identity cannot revive an already invalidated capability', async () => {
  const f = fixture(), cap = await f.create(); f.data.startTicks = '100';
  assert.throws(() => outerNetworkPin(cap), /CHANGED/);
  f.data.startTicks = '99';
  assert.throws(() => outerNetworkPin(cap), /NOT_LIVE/);
  await assert.rejects(cleanupOuterNetworkSession(cap), /OUTER_CLEANUP_UNPROVEN/);
});
