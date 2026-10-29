import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { prepareTrialPayload, describeTrialPayload, cleanupTrialPayload, runPrivateDockerTrialProbes, REQUIRED_TRIAL_PROBE_CONTROLS, verifyTrialOuterTopology } from '../lib/private-docker-trial-probes.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const binding = { sha: 'a'.repeat(40), runId: '9', attempt: '1', job: 'private-docker-trial', profile: 'ab', nonce: '11111111-1111-4111-8111-111111111111' };
const ROLES = ['ipv4', 'ipv6', 'dnsLoopUdp', 'dnsLoopTcp', 'dnsNonLoopUdp', 'dnsNonLoopTcp', 'ipv6Benchmark'];
const imageId = 'sha256:' + '1'.repeat(64), networkId = '2'.repeat(64), containerIds = ['3'.repeat(64), '4'.repeat(64)];
const directory = '/tmp/owned', pythonPath = '/usr/bin/python3.12', dataRoot = directory + '/data';
const prefix = 'lg360v2_' + hash(JSON.stringify(binding)).slice(0, 12), label = { 'io.liftgo.trial2.binding': hash(JSON.stringify(binding)) };
const goodProbe = () => ({ connected: true, received: true, ok: true, answers: [], rcode: null, errno: null });
const blockedProbe = () => ({ connected: false, received: false, ok: false, answers: [], rcode: null, errno: 111 });
const metadata = (kind = 'file', overrides = {}) => ({ uid: 0, mode: kind === 'directory' ? 0o40700 : 0o100600, ino: 100,
  isDirectory: () => kind === 'directory', isFile: () => kind === 'file', isSymbolicLink: () => false, ...overrides });
function topologyFixture() {
  const bridge = 'br-' + networkId.slice(0, 12);
  const links = [
    { ifindex: 1, ifname: 'lo', flags: ['LOOPBACK', 'UP'], link_type: 'loopback' },
    { ifindex: 2, ifname: 'docker0', flags: ['BROADCAST'], linkinfo: { info_kind: 'bridge' } },
    { ifindex: 3, ifname: bridge, flags: ['BROADCAST', 'UP'], linkinfo: { info_kind: 'bridge' } },
    { ifindex: 4, ifname: 'vethaabb', flags: ['UP'], master: bridge, linkinfo: { info_kind: 'veth' } },
    { ifindex: 5, ifname: 'vethccdd', flags: ['UP'], master: 3, linkinfo: { info_kind: 'veth' } },
  ];
  const addresses = links.map(row => ({ ifname: row.ifname, ifindex: row.ifindex, addr_info: row.ifname === 'lo' ?
    [{ family: 'inet', local: '127.0.0.1', prefixlen: 8, scope: 'host' }, { family: 'inet6', local: '::1', prefixlen: 128, scope: 'host' }] :
    row.ifname === 'docker0' ? [{ family: 'inet', local: '172.30.36.1', prefixlen: 24, scope: 'global' }] :
    row.ifname === bridge ? [{ family: 'inet', local: '198.19.36.1', prefixlen: 24, scope: 'global' }] : [] }));
  return { links, addresses, ipv4Routes: [{ dev: 'docker0', dst: '172.30.36.0/24', protocol: 'kernel', scope: 'link', prefsrc: '172.30.36.1' },
    { dev: bridge, dst: '198.19.36.0/24', protocol: 'kernel', scope: 'link', prefsrc: '198.19.36.1' },
    { dev: 'lo', dst: '127.0.0.0/8', protocol: 'kernel', type: 'local', table: 'local' }],
  ipv6Routes: [{ dev: 'lo', dst: '::1', protocol: 'kernel', type: 'local', table: 'local' }] };
}

function fixture() {
  const calls = [], pin = {}, archivePath = directory + '/python-probe.tar', bytes = Buffer.from('synthetic archive; never executed');
  const state = { archiveExists: false, bytes, inode: 100, mutatedEndpoint: false, mutateBinding: false, omitRole: false, unexpected: false,
    dirtyReceipts: false, leaked: false, missingHeader: false, duplicateHeader: false, publishedFail: false, aliasFail: false,
    privileged: false, cleanupRemains: false, cleanupThrows: false, payloadOutput: null, clock: 1000, advance: 0, invalidDns: false,
    abort: false, positiveFail: false, positiveIdentityFail: false, imageBad: false, deleted: false, topologyCalls: 0, topologyAfterUplink: false, aliasFailAfter: false };
  const identity = { pid: 501, startTicks: '99', namespaceInode: 101, loIfindex: 1, nonce: binding.nonce };
  const endpoints = Object.fromEntries(ROLES.map((role, index) => {
    const address = role === 'ipv6' ? '::1' : role === 'ipv6Benchmark' ? 'fd00:360::1' : role.startsWith('dnsNonLoop') ? '198.18.0.1' : '127.254.36.1';
    return [role, { role, address, port: role.startsWith('dns') ? 53 : 35000 + index, family: address.includes(':') ? 6 : 4, protocol: role.endsWith('Udp') ? 'udp' : 'tcp' }];
  }));
  const receipts = Object.fromEntries(ROLES.map(role => [role, 1])); let negativeSeen = false, createIndex = 0;
  const fs = {
    uid: () => 0,
    realpathSync: file => file === '/usr/bin/python3' ? pythonPath : file,
    lstatSync(file) {
      if ([directory, directory + '/client'].includes(file)) return metadata('directory');
      if (file === pythonPath) return metadata('file', { mode: 0o100755 });
      if (file === archivePath) { if (!state.archiveExists) { const error = new Error('absent'); error.code = 'ENOENT'; throw error; } return metadata('file', { ino: state.inode }); }
      if (file.endsWith('/resolv.conf')) return metadata();
      assert.fail('Unexpected mocked path ' + file);
    },
    readFileSync(file, encoding) {
      if (file === archivePath) return state.bytes;
      if (file.endsWith('/resolv.conf')) {
        assert.equal(encoding, 'utf8'); const first = file.includes(containerIds[0]);
        return 'nameserver 127.0.0.11\n' + (state.missingHeader ? '' : first ? '# ExtServers: [host(127.254.36.1)]\n# Overrides: []\n' : '# ExtServers: [198.18.0.1]\n# Overrides: [nameservers]\n') +
          (state.duplicateHeader ? 'nameserver 192.0.2.1\n' : '');
      }
      assert.fail('Unexpected mocked read');
    },
    unlinkSync(file) { assert.equal(file, archivePath); state.archiveExists = false; state.deleted = true; },
  };
  const image = () => ({ Id: imageId, Architecture: 'amd64', Os: 'linux', RootFS: { Type: 'layers', Layers: ['sha256:' + '5'.repeat(64)] }, Config: { User: state.imageBad ? '0' : '65534:65534', Labels: label } });
  const network = () => ({ Id: networkId, Driver: 'bridge', Internal: false, Labels: label, IPAM: { Config: [{ Subnet: '198.19.36.0/24', Gateway: '198.19.36.1' }] } });
  const container = id => ({ Id: id, Image: imageId, Config: { Labels: label, User: '65534:65534', Entrypoint: [pythonPath] },
    HostConfig: { ReadonlyRootfs: true, CapDrop: ['ALL'], Privileged: state.privileged, NetworkMode: prefix }, State: { Running: true },
    ResolvConfPath: `${dataRoot}/containers/${id}/resolv.conf`,
    NetworkSettings: { Networks: { [prefix]: { IPAddress: id === containerIds[0] ? '198.19.36.2' : '198.19.36.3' } } } });
  const drivers = { fs, now: () => state.clock,
    execute(executable, args, options) {
      calls.push({ kind: 'assemble', executable, args, options }); state.archiveExists = true;
      return state.payloadOutput ?? JSON.stringify({ pythonPath, sha256: hash(state.bytes), sourceFiles: 20, sitePackages: false });
    },
    run(cap, executable, args) {
      assert.equal(cap, pin); calls.push({ kind: 'run', executable, args }); state.clock += state.advance;
      if (executable === pythonPath) return JSON.stringify(state.publishedFail ? blockedProbe() : goodProbe());
      if (executable === '/usr/sbin/ip') {
        const observation = topologyFixture();
        if (state.topologyAfterUplink && state.topologyCalls >= 4) observation.links.push({ ifindex: 6, ifname: 'eth0', flags: ['UP'], linkinfo: { info_kind: 'veth' } });
        state.topologyCalls++;
        return JSON.stringify(args.includes('link') ? observation.links : args.includes('addr') ? observation.addresses : args.includes('-4') ? observation.ipv4Routes : observation.ipv6Routes);
      }
      assert.equal(executable, '/usr/bin/docker'); assert.deepEqual(args.slice(0, 4), ['--config', directory + '/client', '--host', 'unix://' + directory + '/docker.sock']);
      const a = args.slice(4), key = a.slice(0, 2).join(' ');
      if (key === 'image import') return imageId + '\n';
      if (key === 'image inspect') return JSON.stringify([image()]);
      if (key === 'network create') return networkId + '\n';
      if (key === 'network inspect') return JSON.stringify([network()]);
      if (key === 'container create') return containerIds[createIndex++] + '\n';
      if (key === 'container start') return a[2];
      if (key === 'container inspect') return JSON.stringify([container(a[2])]);
      if (key === 'container exec') {
        const mode = a[8], address = a[10], name = a[12];
        if (name?.endsWith('.invalid')) {
          negativeSeen = true;
          if (address === '127.0.0.11') return JSON.stringify({ ...blockedProbe(), connected: mode === 'dns-tcp', received: true,
            errno: state.invalidDns ? 'INVALID_DNS' : null, rcode: state.invalidDns ? null : 2 });
          return JSON.stringify(state.leaked ? goodProbe() : blockedProbe());
        }
        if (mode === 'tcp') {
          if (!['::1', '198.19.36.2', '198.19.36.3'].includes(address)) { negativeSeen = true; return JSON.stringify(state.leaked ? goodProbe() : blockedProbe()); }
          return JSON.stringify(goodProbe());
        }
        return JSON.stringify({ ...goodProbe(), ok: !state.aliasFail && !(state.aliasFailAfter && negativeSeen), rcode: 0, answers: [name.endsWith('_a') ? '198.19.36.2' : '198.19.36.3'] });
      }
      if (['container rm', 'network rm', 'image rm'].includes(key)) { if (state.cleanupThrows) throw new Error('private output must never escape'); return 'removed'; }
      if (['container ls', 'network ls', 'image ls'].includes(key)) return state.cleanupRemains ? (key === 'image ls' ? imageId : 'remaining-owned-resource') : '';
      assert.fail('Unexpected mocked command ' + key);
    } };
  const canaries = {
    snapshot() {
      const out = { binding: { ...binding, ...(state.mutateBinding ? { sha: 'b'.repeat(40) } : {}) }, identity: { ...identity },
        receipts: { ...receipts }, unexpectedReceipts: Object.fromEntries(ROLES.map(role => [role, state.unexpected ? 1 : 0])), endpoints: structuredClone(endpoints) };
      if (state.dirtyReceipts && negativeSeen) out.receipts.ipv4 += 1;
      if (state.omitRole) delete out.endpoints.ipv4;
      if (state.mutatedEndpoint) out.endpoints.ipv6.address = '127.254.36.1';
      return out;
    },
    async positive() { return { status: state.positiveFail ? 'FAIL' : 'LOCAL_CANARIES_POSITIVE', binding,
      identity: { ...identity, ...(state.positiveIdentityFail ? { pid: 999 } : {}) }, roles: ROLES }; },
  };
  const payload = () => prepareTrialPayload({ directory, nonce: binding.nonce }, drivers);
  const args = cap => ({ pin, dockerHost: 'unix://' + directory + '/docker.sock', clientDirectory: directory + '/client', dockerPath: '/usr/bin/docker', dataRoot,
    payload: cap, binding, canaries, resolver: { daemonAddress: '127.254.36.1', sandboxAddress: '198.18.0.1', configuredBeforeDaemon: true }, signal: { get aborted() { return state.abort; } } });
  return { calls, state, drivers, canaries, payload, args, run: cap => runPrivateDockerTrialProbes(args(cap), drivers) };
}

test('payload preparation is fully mocked and requires isolated Python without site packages or shell', () => {
  const f = fixture(), cap = f.payload(), result = describeTrialPayload(cap), call = f.calls[0];
  assert.equal(result.archivePath, directory + '/python-probe.tar'); assert.equal(result.replay_authorized, false);
  assert.deepEqual(call.args.slice(0, 4), ['-I', '-S', '-B', '-c']); assert.equal(call.options.shell, false);
  assert.deepEqual(call.options.env, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' });
  const cfg = JSON.parse(call.args[5]); assert.equal(cfg.archive, result.archivePath); assert.ok(cfg.worker.includes("mode=='serve'"));
  assert.ok(call.args[4].includes("'site-packages','dist-packages'"));
});
test('payload cleanup verifies owner/inode/hash and never grants full cleanup', () => {
  const f = fixture(), cap = f.payload();
  assert.deepEqual(cleanupTrialPayload(cap), { status: 'TRIAL_PAYLOAD_CLEANED', cleanup_verified: true, full_cleanup_verified: false, replay_authorized: false });
  assert.equal(f.state.deleted, true); assert.throws(() => cleanupTrialPayload(cap), /CLOSED/); assert.throws(() => describeTrialPayload(cap), /CLOSED/);
});
test('payload failure reports exact pending archive without forwarding helper output', () => {
  const f = fixture(); f.state.payloadOutput = 'private raw helper output';
  assert.throws(f.payload, error => error.code === 'TRIAL_PAYLOAD_PREPARATION_FAILED' && error.pending_resources.archive.path === directory + '/python-probe.tar' && !error.message.includes('raw'));
});
test('preexisting archive is never overwritten or adopted', () => {
  const f = fixture(); f.state.archiveExists = true; assert.throws(f.payload, /ALREADY_EXISTS/); assert.equal(f.calls.length, 0);
});
for (const [name, mutate] of [['hash', f => { f.state.bytes = Buffer.from('changed'); }], ['inode', f => { f.state.inode++; }]]) test(`changed payload ${name} prevents execution and cleanup is sticky`, () => {
  const f = fixture(), cap = f.payload(); mutate(f);
  assert.throws(() => describeTrialPayload(cap)); assert.throws(() => cleanupTrialPayload(cap), /CLEANUP_UNPROVEN/);
  assert.equal(f.state.deleted, false); assert.throws(() => cleanupTrialPayload(cap), /CLOSED/);
});
test('complete mocked probes exercise both Docker DNS routes and leave no grant', async () => {
  const f = fixture(), cap = f.payload(), result = await f.run(cap);
  assert.equal(result.kind, 'fixture'); assert.equal(result.status, 'PROBES_OBSERVED');
  assert.equal(result.controls.length, 18); assert.equal(result.cleanup_verified, true); assert.equal(result.full_cleanup_verified, false);
  assert.deepEqual(result.controls.map(control => control.name), REQUIRED_TRIAL_PROBE_CONTROLS);
  assert.equal(f.state.topologyCalls, 8); assert.equal(verifyTrialOuterTopology({ observation: result.topology.after, networkId }).status, 'OWNED_TOPOLOGY_VALID');
  assert.equal(result.sql_authorized, false); assert.equal(result.replay_authorized, false);
  assert.deepEqual(result.checks, { 'daemon-host': true, 'sandbox-override': true });
  assert.ok(result.controls.every(control => control.positiveBefore && control.positiveAfter && control.blocked));
  const commands = f.calls.filter(call => call.kind === 'run').map(call => call.args.slice(4));
  assert.equal(commands.filter(a => a[0] === 'container' && a[1] === 'create' && a.includes('--dns')).length, 1);
  assert.ok(commands.filter(a => a[0] === 'container' && a[1] === 'create').every(a => a[a.indexOf('--pull') + 1] === 'never'));
  assert.equal(commands.some(a => a.includes('--internal')), false);
  assert.equal(commands.filter(a => a[0] === 'container' && a[1] === 'rm').length, 2);
});
for (const [name, mutate] of [
  ['external positive failed', f => { f.state.positiveFail = true; }], ['canary identity changed', f => { f.state.positiveIdentityFail = true; }],
  ['foreign SHA with same nonce', f => { f.state.mutateBinding = true; }], ['omitted canary role', f => { f.state.omitRole = true; }],
  ['mutated IPv6 endpoint', f => { f.state.mutatedEndpoint = true; }], ['unexpected traffic', f => { f.state.unexpected = true; }],
  ['receipts increased', f => { f.state.dirtyReceipts = true; }], ['direct host reachability', f => { f.state.leaked = true; }],
  ['DNS alias positive failed', f => { f.state.aliasFail = true; }], ['published port failed', f => { f.state.publishedFail = true; }],
  ['Docker DNS lost after negative controls', f => { f.state.aliasFailAfter = true; }],
  ['privileged container', f => { f.state.privileged = true; }], ['root image', f => { f.state.imageBad = true; }],
  ['malformed upstream DNS response', f => { f.state.invalidDns = true; }],
  ['uplink appeared after probes', f => { f.state.topologyAfterUplink = true; }],
  ['cleanup resource remains', f => { f.state.cleanupRemains = true; }], ['cleanup transport failed', f => { f.state.cleanupThrows = true; }],
]) test(`blocks ${name} without runtime PASS and still attempts owned cleanup`, async () => {
  const f = fixture(), cap = f.payload(); mutate(f);
  await assert.rejects(f.run(cap), error => /^TRIAL_/.test(error.code) && !error.message.includes('private output'));
  assert.ok(f.calls.some(call => call.kind === 'run' && call.args.includes('rm')));
});
for (const duplicate of [false, true]) test(`unknown or extra Docker DNS source blocks before any unknown query (${duplicate})`, async () => {
  const f = fixture(), cap = f.payload(); if (duplicate) f.state.duplicateHeader = true; else f.state.missingHeader = true;
  await assert.rejects(f.run(cap), error => error.failure_code === 'TRIAL_DOCKER_DNS_ROUTE_UNPROVEN');
  assert.equal(f.calls.some(call => call.args?.some(value => typeof value === 'string' && value.endsWith('.invalid'))), false);
});
test('serialized payloads and traversal endpoints never reach Docker', async () => {
  const f = fixture(), cap = f.payload();
  await assert.rejects(runPrivateDockerTrialProbes(f.args(cap)), /PAIR_PAYLOAD_AND_PROBE_DRIVERS/);
  await assert.rejects(runPrivateDockerTrialProbes(f.args(JSON.parse(JSON.stringify(cap))), f.drivers), /UNMINTED/);
  await assert.rejects(runPrivateDockerTrialProbes({ ...f.args(cap), dockerHost: 'unix://' + directory + '/../../var/run/docker.sock' }, f.drivers), /PATH/);
  assert.equal(f.calls.filter(call => call.kind === 'run').length, 0);
});
test('missing prestart resolver configuration blocks before importing an image', async () => {
  const f = fixture(), cap = f.payload();
  await assert.rejects(runPrivateDockerTrialProbes({ ...f.args(cap), resolver: null }, f.drivers), /PRESTART_CONFIG/);
  assert.equal(f.calls.filter(call => call.kind === 'run').length, 0);
});
test('cancellation prevents probes but cleanup uses its own bounded transport', async () => {
  const f = fixture(), cap = f.payload(); f.state.abort = true;
  await assert.rejects(f.run(cap), error => error.failure_code === 'TRIAL_PROBES_CANCELLED');
});
test('cleanup deadline fails closed instead of spending unbounded time on Docker', async () => {
  const f = fixture(), cap = f.payload(); f.state.advance = 3_000;
  await assert.rejects(f.run(cap), /CLEANUP_UNPROVEN/);
});
test('work deadline and cancellation callback block without skipping cleanup', async () => {
  const f = fixture(), cap = f.payload(); f.state.advance = 1000;
  await assert.rejects(runPrivateDockerTrialProbes({ ...f.args(cap), deadlineAtMs: 1500 }, f.drivers), error => error.failure_code === 'TRIAL_PROBE_WORK_DEADLINE');
  await assert.rejects(runPrivateDockerTrialProbes({ ...f.args(cap), cancelled: () => true }, f.drivers), error => error.failure_code === 'TRIAL_PROBES_CANCELLED');
});
test('partial drivers never mix with default administrative IO', () => {
  const f = fixture(); assert.throws(() => prepareTrialPayload({ directory, nonce: binding.nonce }, { execute: f.drivers.execute }), /PAIR_ALL/);
  assert.equal(f.calls.length, 0);
});
test('bounded topology accepts owned bridges/veth and rejects unmodeled routes without any kernel IO', () => {
  assert.equal(verifyTrialOuterTopology({ observation: topologyFixture(), networkId }).status, 'OWNED_TOPOLOGY_VALID');
});
for (const [name, mutate] of [
  ['uplink', o => { o.links.push({ ifname: 'eth0', ifindex: 99, flags: ['UP'] }); }],
  ['default route', o => { o.ipv4Routes.push({ dst: 'default', dev: 'docker0', gateway: '172.30.36.254' }); }],
  ['external device route', o => { o.ipv4Routes.push({ dst: '172.30.36.0/24', dev: 'eth0' }); }],
  ['external address', o => { o.addresses[1].addr_info[0].local = '192.0.2.10'; }],
  ['veth wrong master', o => { o.links[3].master = 'docker0'; }],
  ['foreign connected prefix', o => { o.ipv4Routes[0].dst = '10.0.0.0/8'; }],
  ['IPv6 global route', o => { o.ipv6Routes.push({ dev: 'docker0', dst: '2001:db8::/32' }); }],
  ['nexthop indirection', o => { o.ipv4Routes[0].nexthops = [{ dev: 'eth0', gateway: '192.0.2.1' }]; }],
  ['policy routing table', o => { o.ipv4Routes[0].table = 100; }],
  ['source changed', o => { o.ipv4Routes[0].prefsrc = '192.0.2.1'; }],
]) test(`fresh topology fails closed for ${name}`, () => {
  const observation = topologyFixture(); mutate(observation);
  assert.throws(() => verifyTrialOuterTopology({ observation, networkId }), /^Error: TRIAL_TOPOLOGY_/);
});
