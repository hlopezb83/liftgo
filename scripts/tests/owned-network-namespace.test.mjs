import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closePinnedNamespace, observeEmptyBoundary, pinOwnedNetworkNamespace, runInPinnedNamespace } from '../lib/owned-network-namespace.mjs';

const NONCE = '11111111-1111-4111-8111-111111111111';
const NSFS = 0x6e736673;
const SAFE = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1' };

// Every kernel call and child process is mocked. No default IO is ever invoked.
function fixture() {
  const owner = { binding: { sha: 'a'.repeat(40), runId: '9001', attempt: '1', job: 'supabase-replay', profile: 'catalog', nonce: NONCE },
    anchor: { pid: 4201, startTicks: '99', namespaceInode: 202 }, hostNamespaceInode: 101 };
  const data = { start: '99', inode: 202, fdInode: 202, host: 101, fsType: NSFS, fd: 71, closed: false,
    argv: ['/usr/bin/python3', '/owned/anchor.py', '__bootstrap_anchor', NONCE], pidState: 'S', calls: [], commands: [],
    links: [{ ifindex: 1, ifname: 'lo', flags: ['LOOPBACK', 'UP'], link_type: 'loopback' }],
    ipv4: [{ type: 'local', dst: '127.0.0.1', dev: 'lo', table: 'local', protocol: 'kernel', scope: 'host', prefsrc: '127.0.0.1', flags: [] }],
    ipv6: [{ type: 'local', dst: '::1', dev: 'lo', table: 'local', protocol: 'kernel', metric: 0, pref: 'medium' }],
    afterOpen: null, beforeExecute: null, executeError: null, rawOutput: null };
  const kernel = {
    readFileSync(path, encoding) {
      data.calls.push(['read', path]);
      if (path === '/proc/4201/stat') {
        assert.equal(encoding, 'utf8');
        const fields = [data.pidState, ...Array(18).fill('0'), data.start];
        return '4201 (anchor with ) parentheses) ' + fields.join(' ') + '\n';
      }
      if (path === '/proc/4201/cmdline') return Buffer.from(data.argv.join('\0') + '\0');
      assert.fail('Unexpected mock read path');
    },
    statSync(path) {
      data.calls.push(['stat', path]);
      if (path === '/proc/self/ns/net') return { ino: data.host };
      if (path === '/proc/4201/ns/net') return { ino: data.inode };
      assert.fail('Unexpected mock stat path');
    },
    openSync(path, flags) {
      data.calls.push(['open', path, flags]);
      assert.equal(path, '/proc/4201/ns/net'); assert.equal(flags & 0o2000000, 0o2000000);
      data.afterOpen?.(); return data.fd;
    },
    fstatSync(fd) { assert.equal(fd, data.fd); if (data.closed) throw new Error('EBADF'); return { ino: data.fdInode }; },
    statfsSync(path) { assert.equal(path, '/proc/self/fd/71'); if (data.closed) throw new Error('EBADF'); return { type: data.fsType }; },
    closeSync(fd) { assert.equal(fd, data.fd); data.calls.push(['close', fd]); data.closed = true; },
  };
  const execute = (executable, args, options) => {
    data.commands.push({ executable, args, options }); data.beforeExecute?.();
    if (data.executeError) throw data.executeError;
    if (data.rawOutput !== null) return data.rawOutput;
    if (args[2] !== '/usr/sbin/ip') return 'local-output';
    if (args.includes('link')) return JSON.stringify(data.links);
    return JSON.stringify(args.includes('-4') ? data.ipv4 : data.ipv6);
  };
  return { owner, data, kernel, execute, pin: () => pinOwnedNetworkNamespace(owner, { kernel, execute }) };
}

test('minted pin is opaque, frozen and never runtime authorization', () => {
  const f = fixture(), pin = f.pin();
  assert.equal(Object.isFrozen(pin), true); assert.equal(pin.runtime_authorized, false);
  assert.equal(f.data.commands.length, 0); closePinnedNamespace(pin);
});

test('run maps the pinned FD to child 3 with fixed environment and no shell', () => {
  const f = fixture(), pin = f.pin();
  assert.equal(runInPinnedNamespace(pin, '/usr/bin/printf', ['%s', 'literal; $(not-a-shell)']), 'local-output');
  const call = f.data.commands[0];
  assert.equal(call.executable, '/usr/bin/nsenter');
  assert.deepEqual(call.args, ['--net=/proc/self/fd/3', '--', '/usr/bin/printf', '%s', 'literal; $(not-a-shell)']);
  assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe', 71]);
  assert.deepEqual(call.options.env, SAFE); assert.equal(call.options.shell, false); assert.equal(call.options.cwd, '/');
  assert.equal(call.options.timeout, 15000); assert.equal(call.options.maxBuffer, 1024 * 1024);
  closePinnedNamespace(pin);
});

test('empty boundary reads link and BOTH all-table route families through the same FD', () => {
  const f = fixture(), pin = f.pin(), result = observeEmptyBoundary(pin);
  assert.equal(result.status, 'BOUNDARY_OBSERVED'); assert.equal(result.runtime_authorized, false);
  assert.deepEqual(result.binding, f.owner.binding); assert.equal(result.anchor.namespaceInode, 202);
  assert.deepEqual(result.interfaces, ['lo']); assert.ok(result.observedAt >= result.startedAt);
  assert.deepEqual(f.data.commands.map(c => c.args.slice(2)), [
    ['/usr/sbin/ip', '-j', 'link', 'show'], ['/usr/sbin/ip', '-4', '-j', 'route', 'show', 'table', 'all'],
    ['/usr/sbin/ip', '-6', '-j', 'route', 'show', 'table', 'all'],
  ]);
  assert.ok(f.data.commands.every(c => c.options.stdio[3] === 71)); closePinnedNamespace(pin);
});

test('an empty route inventory is observed as empty rather than omitting queries', () => {
  const f = fixture(); f.data.ipv4 = []; f.data.ipv6 = [];
  const pin = f.pin(), result = observeEmptyBoundary(pin);
  assert.deepEqual(result.ipv4Routes, []); assert.deepEqual(result.ipv6Routes, []);
  assert.equal(f.data.commands.length, 3); closePinnedNamespace(pin);
});

test('close is idempotent and revokes further execution', () => {
  const f = fixture(), pin = f.pin();
  assert.deepEqual(closePinnedNamespace(pin), { status: 'CLOSED', runtime_authorized: false });
  closePinnedNamespace(pin); assert.equal(f.data.calls.filter(c => c[0] === 'close').length, 1);
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /CLOSED/);
  assert.throws(() => observeEmptyBoundary(pin), /CLOSED/); assert.equal(f.data.commands.length, 0);
});

for (const [label, mutate] of [
  ['changed start ticks', f => { f.data.start = '100'; }],
  ['changed target namespace', f => { f.data.inode = 203; }],
  ['actual host differs from recorded host', f => { f.data.host = 102; }],
  ['namespace is the actual runner namespace', f => { f.data.inode = 101; }],
  ['missing anchor marker', f => { f.data.argv[2] = '__other'; }],
  ['nonce fragment is not exact', f => { f.data.argv[3] += '-suffix'; }],
  ['duplicated nonce', f => { f.data.argv.splice(1, 0, NONCE); }],
  ['unexpected trailing anchor args', f => { f.data.argv.push('extra'); }],
  ['zombie process', f => { f.data.pidState = 'Z'; }],
]) test('pin rejects ' + label + ' before open or command', () => {
  const f = fixture(); mutate(f); assert.throws(f.pin, /NAMESPACE_PIN_FAILED/);
  assert.equal(f.data.calls.some(c => c[0] === 'open'), false); assert.equal(f.data.commands.length, 0);
});

for (const [label, mutate] of [
  ['PID reused during open', f => { f.data.afterOpen = () => { f.data.start = '100'; }; }],
  ['namespace replaced during open', f => { f.data.afterOpen = () => { f.data.inode = 203; }; }],
  ['host namespace changed during open', f => { f.data.afterOpen = () => { f.data.host = 102; }; }],
]) test('pin closes owned FD after ' + label, () => {
  const f = fixture(); mutate(f); assert.throws(f.pin, /NAMESPACE_PIN_FAILED/);
  assert.equal(f.data.closed, true); assert.equal(f.data.commands.length, 0);
});

for (const [label, mutate] of [
  ['non-nsfs descriptor', f => { f.data.fsType = 123; }],
  ['descriptor for another namespace', f => { f.data.fdInode = 999; }],
]) test('pin refuses ' + label + ' without closing unrelated descriptor', () => {
  const f = fixture(); mutate(f); assert.throws(f.pin, /NAMESPACE_PIN_FAILED/);
  assert.equal(f.data.calls.some(c => c[0] === 'close'), false); assert.equal(f.data.commands.length, 0);
});

for (const [label, mutate] of [
  ['PID reuse', f => { f.data.start = '100'; }], ['namespace replacement', f => { f.data.inode = 203; }],
  ['host changed', f => { f.data.host = 102; }], ['anchor argv changed', f => { f.data.argv[2] = '__other'; }],
  ['FD closed externally', f => { f.data.closed = true; }], ['FD replaced', f => { f.data.fdInode = 999; }],
]) test('operation rejects ' + label + ' before any command', () => {
  const f = fixture(), pin = f.pin(); mutate(f);
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /IDENTITY_UNPROVEN/);
  assert.equal(f.data.commands.length, 0);
});

test('identity loss during execution discards output and revokes the pin', () => {
  const f = fixture(), pin = f.pin(); f.data.beforeExecute = () => { f.data.start = '100'; };
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /IDENTITY_UNPROVEN/);
  assert.equal(f.data.closed, true); assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /CLOSED/);
});

test('failed command does not expose child stdout/stderr or command arguments', () => {
  const f = fixture(), pin = f.pin(); f.data.executeError = Object.assign(new Error('private-output'), { stderr: 'private-output', stdout: 'private-output' });
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/false', ['private-output']), error => error.message === 'NAMESPACE_COMMAND_FAILED' && !Object.hasOwn(error, 'cause'));
  closePinnedNamespace(pin);
});

test('owner copies cannot mutate an established capability', () => {
  const f = fixture(), pin = f.pin(); f.owner.binding.nonce = '22222222-2222-4222-8222-222222222222';
  f.owner.anchor.namespaceInode = 999;
  assert.equal(runInPinnedNamespace(pin, '/usr/bin/true', []), 'local-output'); closePinnedNamespace(pin);
});

for (const fake of [null, {}, { kind: 'OWNED_NETWORK_NAMESPACE', runtime_authorized: false }]) test('JSON cannot mint a pin: ' + JSON.stringify(fake), () => {
  assert.throws(() => runInPinnedNamespace(fake, '/usr/bin/true', []), /UNMINTED/);
  assert.throws(() => closePinnedNamespace(fake), /UNMINTED/);
});

test('serialized genuine pin cannot become a capability', () => {
  const f = fixture(), pin = f.pin(), fake = JSON.parse(JSON.stringify(pin));
  assert.throws(() => observeEmptyBoundary(fake), /UNMINTED/); closePinnedNamespace(pin);
});

for (const [label, mutate] of [
  ['extra owner field', f => { f.owner.extra = true; }],
  ['extra binding field', f => { f.owner.binding.authorized = true; }],
  ['profile omitted', f => { delete f.owner.binding.profile; }],
  ['unknown profile', f => { f.owner.binding.profile = 'minimal-ab'; }],
  ['binding coercion', f => { f.owner.binding.runId = 9001; }],
  ['invalid PID', f => { f.owner.anchor.pid = '../1'; }],
  ['same host/target inode', f => { f.owner.hostNamespaceInode = 202; }],
]) test('owner validation rejects ' + label + ' without IO', () => {
  const f = fixture(); mutate(f); assert.throws(f.pin); assert.deepEqual(f.data.calls, []);
});

test('partial test drivers cannot fall back to real IO', () => {
  const f = fixture();
  assert.throws(() => pinOwnedNetworkNamespace(f.owner, { kernel: f.kernel }), /PAIR/);
  assert.throws(() => pinOwnedNetworkNamespace(f.owner, { execute: f.execute }), /PAIR/);
  assert.throws(() => pinOwnedNetworkNamespace(f.owner, { kernel: {}, execute: f.execute }), /KERNEL/);
  assert.deepEqual(f.data.calls, []);
});

for (const [label, mutate] of [
  ['external interface', f => { f.data.links.push({ ifname: 'eth0', link_type: 'ether', flags: ['UP'] }); }],
  ['missing loopback identity', f => { f.data.links = [{ ifname: 'lo' }]; }],
  ['IPv4 default route', f => { f.data.ipv4 = [{ dst: 'default', dev: 'lo' }]; }],
  ['IPv6 default route', f => { f.data.ipv6 = [{ dst: 'default', dev: 'lo' }]; }],
  ['non-loopback IPv4', f => { f.data.ipv4 = [{ dst: '10.0.0.0/8', dev: 'lo' }]; }],
  ['non-loopback IPv6', f => { f.data.ipv6 = [{ dst: 'fe80::/64', dev: 'lo' }]; }],
  ['gateway field', f => { f.data.ipv4[0].gateway = '127.0.0.2'; }],
  ['multipath field', f => { f.data.ipv4[0].multipath = []; }],
  ['missing route inventory', f => { f.data.ipv4 = null; }],
  ['unmodeled route field', f => { f.data.ipv6[0].encap = {}; }],
]) test('boundary blocks ' + label, () => {
  const f = fixture(); mutate(f); const pin = f.pin(); assert.throws(() => observeEmptyBoundary(pin)); closePinnedNamespace(pin);
});

test('malformed command JSON cannot become a boundary observation', () => {
  const f = fixture(); f.data.rawOutput = 'not-json'; const pin = f.pin();
  assert.throws(() => observeEmptyBoundary(pin), /BOUNDARY_UNOBSERVED/); closePinnedNamespace(pin);
});

test('invalid command paths/arguments fail before child execution', () => {
  const f = fixture(), pin = f.pin();
  for (const executable of ['ip', '/usr/bin/../bin/ip', '/usr/bin/ip\0bad']) assert.throws(() => runInPinnedNamespace(pin, executable, []), /INVALID_NAMESPACE_COMMAND/);
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/ip', ['x\0y']), /INVALID_NAMESPACE_COMMAND/);
  assert.equal(f.data.commands.length, 0); closePinnedNamespace(pin);
});

test('close refuses to close a reused unrelated descriptor', () => {
  const f = fixture(), pin = f.pin(); f.data.fdInode = 999;
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
  assert.equal(f.data.calls.some(c => c[0] === 'close'), false);
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /CLOSED/);
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
});

test('failed close stays unproven on repeat and never returns a cleanup success', () => {
  const f = fixture(); let attempts = 0;
  f.kernel.closeSync = () => { attempts += 1; throw new Error('mock close failure'); };
  const pin = f.pin();
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
  assert.equal(attempts, 1); assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /CLOSED/);
});

test('an externally closed FD cannot be described as successfully closed by this helper', () => {
  const f = fixture(), pin = f.pin(); f.data.closed = true;
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
});

test('internal revocation preserves a failed FD cleanup as unproven', () => {
  const f = fixture(); let attempts = 0;
  f.kernel.closeSync = () => { attempts += 1; throw new Error('mock close failure'); };
  const pin = f.pin(); f.data.start = '100';
  assert.throws(() => runInPinnedNamespace(pin, '/usr/bin/true', []), /IDENTITY_UNPROVEN/);
  assert.equal(f.data.commands.length, 0); assert.equal(attempts, 1);
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
  assert.throws(() => closePinnedNamespace(pin), /CLOSE_UNPROVEN/);
});
