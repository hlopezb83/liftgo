import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTrialCanaries, snapshotTrialCanaries, positiveTrialCanaries, cleanupTrialCanaries } from '../lib/private-docker-trial-canaries.mjs';

function fixture(profile = 'ab') {
  const binding = { sha: 'a'.repeat(40), runId: '9001', attempt: '1', job: 'trial', profile, nonce: '11111111-1111-4111-8111-111111111111' };
  const baseline = [{ family: 4, local: '127.0.0.1', prefixlen: 8, scope: 'host', label: 'lo', flags: [] },
    { family: 6, local: '::1', prefixlen: 128, scope: 'host', label: null, flags: [] }];
  const data = { uid: 0, inode: 301, identity: { pid: 4201, startTicks: '99', namespaceInode: 101, loIfindex: 1 },
    ifindex: 1, addresses: structuredClone(baseline), handles: {}, calls: [], failOpen: null, failClose: null, noAck: false,
    missingLabel: false, wrongResponse: false, lateUnexpected: false, barrierFail: false, noReceive: false, globalExtras: [] };
  const io = {
    uid: () => data.uid,
    directory(path) { assert.equal(path, '/tmp/private'); data.calls.push(['directory']); return data.inode; },
    identity() { data.calls.push(['identity']); return structuredClone(data.identity); },
    inventory() { data.calls.push(['inventory']); return { ifindex: data.ifindex, addresses: structuredClone(data.addresses) }; },
    globalInventory() { data.calls.push(['global-inventory']); return [...data.addresses.map(row => row.local), ...data.globalExtras.map(row => row.local)]; },
    mutate(operation, row) {
      data.calls.push(['mutate', operation, structuredClone(row)]);
      if (operation === 'add') data.addresses.push({ family: row.family, local: row.local, prefixlen: row.prefixlen, scope: 'host',
        label: data.missingLabel ? null : row.label ?? null, flags: [] });
      else data.addresses = data.addresses.filter(entry => entry.local !== row.local);
      return { acknowledged: !data.noAck };
    },
    async open(endpoint, nonce) {
      assert.equal(nonce, binding.nonce); data.calls.push(['open', endpoint.role]);
      if (data.failOpen === endpoint.role) throw new Error('private raw output');
      let alive = true; const counts = { total: 0, positive: 0, unexpected: 0 };
      const handle = { endpoint: { ...endpoint, port: endpoint.port || 23000 + Object.keys(data.handles).length },
        alive: () => alive, counts: () => ({ ...counts }),
        async barrier() { data.calls.push(['barrier', endpoint.role]); if (data.barrierFail) throw new Error('private raw output');
          if (data.lateUnexpected && endpoint.role === 'dnsNonLoopUdp') { counts.total++; counts.unexpected++; } },
        async close() { data.calls.push(['close', endpoint.role]); if (data.failClose === endpoint.role) throw new Error('private raw output'); alive = false; },
        injectUnexpected() { counts.total++; counts.unexpected++; }, injectPositive() { counts.total++; counts.positive++; }, setCounts(value) { Object.assign(counts, value); } };
      data.handles[endpoint.role] = handle; return handle;
    },
    async request(endpoint, nonce) { data.calls.push(['request', endpoint.role]);
      if (!data.noReceive) data.handles[endpoint.role].injectPositive();
      return { nonce: data.wrongResponse ? '22222222-2222-4222-8222-222222222222' : nonce, role: endpoint.role }; },
  };
  return { data, io, binding, baseline, create: () => startTrialCanaries({ binding, directory: '/tmp/private' }, { testDrivers: io }) };
}

for (const profile of ['catalog', 'rls', 'ab']) test(`${profile}: seven local observers remain fixtures and never authorize SQL`, async () => {
  const f = fixture(profile), cap = await f.create(); assert.equal(Object.isFrozen(cap), true);
  const snapshot = snapshotTrialCanaries(cap);
  assert.equal(snapshot.kind, 'fixture'); assert.equal(snapshot.sql_authorized, false);
  assert.deepEqual(snapshot.binding, f.binding); assert.equal(Object.keys(snapshot.endpoints).length, 7);
  assert.ok(Object.values(snapshot.receipts).every(value => value === 0));
  assert.equal(snapshot.endpoints.dnsLoopUdp.port, 53); assert.equal(snapshot.endpoints.dnsLoopTcp.port, 53);
  assert.equal(snapshot.endpoints.dnsNonLoopUdp.address, '198.18.0.1');
  assert.equal(snapshot.endpoints.ipv6Benchmark.address, 'fd00:360::1');
  const positive = await positiveTrialCanaries(cap);
  assert.equal(positive.status, 'LOCAL_CANARIES_POSITIVE'); assert.deepEqual(positive.binding, f.binding);
  assert.ok(Object.values(positive.receipts).every(value => value === 1));
  assert.ok(Object.values(positive.positiveReceipts).every(value => value === 1));
  assert.ok(Object.values(positive.unexpectedReceipts).every(value => value === 0));
  const positiveAgain = await positiveTrialCanaries(cap);
  assert.ok(Object.values(positiveAgain.receipts).every(value => value === 2));
  const clean = await cleanupTrialCanaries(cap);
  assert.equal(clean.status, 'LOCAL_CANARIES_CLEANED'); assert.equal(clean.full_cleanup_verified, false);
  assert.deepEqual(f.data.addresses, f.baseline);
  assert.equal(f.data.calls.filter(row => row[0] === 'close').length, 7);
  assert.equal(f.data.calls.filter(row => row[0] === 'mutate' && row[1] === 'add').length, 2);
  assert.equal(f.data.calls.filter(row => row[0] === 'mutate' && row[1] === 'del').length, 2);
  assert.equal(f.data.calls.find(row => row[0] === 'mutate' && row[1] === 'add' && row[2].family === 6)[2].label, undefined);
  assert.throws(() => snapshotTrialCanaries(cap), /NOT_LIVE/);
});

test('positive canary proof fails if transport never records receipt', async () => {
  const f = fixture(), cap = await f.create(); f.data.noReceive = true;
  await assert.rejects(positiveTrialCanaries(cap), /POSITIVE_UNPROVEN/);
  assert.throws(() => snapshotTrialCanaries(cap), /NOT_LIVE/);
  await cleanupTrialCanaries(cap);
});
test('wrong nonce responses cannot prove liveness', async () => {
  const f = fixture(), cap = await f.create(); f.data.wrongResponse = true;
  await assert.rejects(positiveTrialCanaries(cap), /POSITIVE_UNPROVEN/);
  await cleanupTrialCanaries(cap);
});
test('unexpected receipt cannot be normalized into a new positive baseline', async () => {
  const f = fixture(), cap = await f.create();
  f.data.handles.dnsLoopUdp.injectUnexpected();
  const snapshot = snapshotTrialCanaries(cap);
  assert.equal(snapshot.receipts.dnsLoopUdp, 1); assert.equal(snapshot.unexpectedReceipts.dnsLoopUdp, 1);
  await assert.rejects(positiveTrialCanaries(cap), /POSITIVE_UNPROVEN/);
  await assert.rejects(cleanupTrialCanaries(cap), /CLEANUP_UNPROVEN/);
  assert.deepEqual(f.data.addresses, f.baseline);
});
test('late receipt observed at worker barrier still blocks the positive proof', async () => {
  const f = fixture(), cap = await f.create(); f.data.lateUnexpected = true;
  await assert.rejects(positiveTrialCanaries(cap), /POSITIVE_UNPROVEN/);
  await assert.rejects(cleanupTrialCanaries(cap), /CLEANUP_UNPROVEN/);
});
test('failed observation barrier cannot be omitted', async () => {
  const f = fixture(), cap = await f.create(); f.data.barrierFail = true;
  await assert.rejects(positiveTrialCanaries(cap), /POSITIVE_UNPROVEN/);
  await cleanupTrialCanaries(cap);
});

for (const [name, mutate] of [
  ['PID reused', f => { f.data.identity.startTicks = '100'; }],
  ['namespace changed', f => { f.data.identity.namespaceInode = 102; }],
  ['loopback replaced', f => { f.data.ifindex = 2; }],
  ['directory replaced', f => { f.data.inode = 302; }],
  ['IPv6 scope changed', f => { f.data.addresses.find(row => row.local === 'fd00:360::1').scope = 'global'; }],
  ['IPv4 label changed', f => { f.data.addresses.find(row => row.local === '198.18.0.1').label = 'lo:other'; }],
  ['address flags changed', f => { f.data.addresses.find(row => row.local === 'fd00:360::1').flags = ['tentative']; }],
]) test(`ownership rejects ${name}, closes own listeners and never deletes uncertain addresses`, async () => {
  const f = fixture(), cap = await f.create(); mutate(f);
  assert.throws(() => snapshotTrialCanaries(cap), /IDENTITY_UNPROVEN/);
  await assert.rejects(cleanupTrialCanaries(cap), /CLEANUP_UNPROVEN/);
  assert.equal(f.data.calls.filter(row => row[0] === 'close').length, 7);
  assert.equal(f.data.calls.filter(row => row[0] === 'mutate' && row[1] === 'del').length, 0);
  await assert.rejects(cleanupTrialCanaries(cap), /PHASE_INVALID/);
});
test('preexisting benchmark address prevents every address mutation and listener', async () => {
  const f = fixture(); f.data.addresses.push({ family: 4, local: '198.18.0.1', prefixlen: 32, scope: 'host', label: 'lo:other', flags: [] });
  await assert.rejects(f.create(), /ALREADY_PRESENT/);
  assert.equal(f.data.calls.some(row => ['open', 'mutate'].includes(row[0])), false);
});
for (const address of ['198.18.0.1', 'fd00:360::1']) test(`benchmark address already on eth0 blocks before any mutation: ${address}`, async () => {
  const f = fixture(); f.data.globalExtras.push({ ifname: 'eth0', local: address });
  await assert.rejects(f.create(), /ALREADY_PRESENT/);
  assert.equal(f.data.calls.some(row => row[0] === 'global-inventory'), true);
  assert.equal(f.data.calls.some(row => ['open', 'mutate'].includes(row[0])), false);
});
test('missing global inventory cannot be treated as evidence of address absence', async () => {
  const f = fixture(); f.io.globalInventory = () => [];
  await assert.rejects(f.create(), /GLOBAL_CANARY_ADDRESS_INVENTORY_UNPROVEN/);
  assert.equal(f.data.calls.some(row => ['open', 'mutate'].includes(row[0])), false);
});
test('an unacknowledged add retains uncertainty and never deletes the address', async () => {
  const f = fixture(); f.data.noAck = true;
  await assert.rejects(f.create(), error => {
    assert.equal(error.code, 'CANARY_PREPARATION_FAILED'); assert.equal(error.pending_resources.rollbackUnproven, true);
    assert.equal(error.pending_resources.addresses[0].local, '198.18.0.1'); return true;
  });
  assert.equal(f.data.calls.some(row => row[0] === 'mutate' && row[1] === 'del'), false);
});
test('IPv4 label readback mismatch does not justify removing an unproven address', async () => {
  const f = fixture(); f.data.missingLabel = true;
  await assert.rejects(f.create(), error => error.pending_resources.rollbackUnproven === true);
  assert.equal(f.data.calls.some(row => row[0] === 'mutate' && row[1] === 'del'), false);
});
test('partial listener acquisition rolls back only its own sockets and addresses', async () => {
  const f = fixture(); f.data.failOpen = 'dnsNonLoopTcp';
  await assert.rejects(f.create(), error => error.code === 'CANARY_PREPARATION_FAILED' && error.pending_resources.rollbackUnproven === false);
  assert.deepEqual(f.data.addresses, f.baseline);
  assert.equal(f.data.calls.filter(row => row[0] === 'close').length, 5);
});
test('listener close error remains sticky and is never represented as cleanup success', async () => {
  const f = fixture(), cap = await f.create(); f.data.failClose = 'ipv6';
  await assert.rejects(cleanupTrialCanaries(cap), /CLEANUP_UNPROVEN/);
  f.data.failClose = null;
  await assert.rejects(cleanupTrialCanaries(cap), /PHASE_INVALID/);
});
test('snapshot copies cannot change endpoints, ownership or receipt counters', async () => {
  const f = fixture(), cap = await f.create(), snapshot = snapshotTrialCanaries(cap);
  snapshot.identity.startTicks = '100'; snapshot.receipts.ipv4 = 999; snapshot.endpoints.ipv4.address = '203.0.113.1';
  const fresh = snapshotTrialCanaries(cap);
  assert.equal(fresh.identity.startTicks, '99'); assert.equal(fresh.receipts.ipv4, 0); assert.equal(fresh.endpoints.ipv4.address, '127.254.36.1');
  await cleanupTrialCanaries(cap);
});
test('serialized JSON does not recover capability or authorize cleanup', async () => {
  const f = fixture(), cap = await f.create(), json = JSON.parse(JSON.stringify(cap));
  assert.throws(() => snapshotTrialCanaries(json), /NOT_LIVE/);
  await assert.rejects(positiveTrialCanaries(json), /NOT_LIVE/);
  await assert.rejects(cleanupTrialCanaries(json), /PHASE_INVALID/);
  await cleanupTrialCanaries(cap);
});
test('incoherent atomic counters fail closed', async () => {
  const f = fixture(), cap = await f.create(); f.data.handles.ipv4.setCounts({ total: 2, positive: 0, unexpected: 0 });
  assert.throws(() => snapshotTrialCanaries(cap), /COUNTERS_UNPROVEN/);
  await assert.rejects(cleanupTrialCanaries(cap), /CLEANUP_UNPROVEN/);
});
test('partial drivers and unknown fields never fall back to real IO', async () => {
  const f = fixture();
  for (const options of [{ testDrivers: { uid: () => 0 } }, { io: f.io }, { testDrivers: f.io, extra: true }])
    await assert.rejects(startTrialCanaries({ binding: f.binding, directory: '/tmp/private' }, options), /TEST_DRIVERS/);
  assert.equal(f.data.calls.length, 0);
});
test('a pending positive request cannot race snapshot or cleanup and timeout remains a failure', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(), cap = await f.create(); f.io.request = () => new Promise(() => {});
  const pending = positiveTrialCanaries(cap);
  assert.throws(() => snapshotTrialCanaries(cap), /BUSY/);
  await assert.rejects(cleanupTrialCanaries(cap), /BUSY/);
  t.mock.timers.tick(2_001);
  await assert.rejects(pending, /POSITIVE_UNPROVEN/);
  await cleanupTrialCanaries(cap);
});
test('a listener opening timeout reports uncertainty and does not claim rollback success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); f.io.open = () => new Promise(() => {});
  const pending = f.create(); t.mock.timers.tick(2_001);
  await assert.rejects(pending, error => error.code === 'CANARY_PREPARATION_FAILED' && error.pending_resources.rollbackUnproven === true);
  assert.deepEqual(f.data.addresses, f.baseline);
});
