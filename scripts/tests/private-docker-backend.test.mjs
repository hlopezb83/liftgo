import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateDockerBackend, startPrivateDockerBackend, inspectPrivateDockerBackend, cleanupPrivateDockerBackend } from '../lib/private-docker-backend.mjs';

const binding = { sha: 'a'.repeat(40), runId: '42', attempt: '1', job: 'supabase-replay', profile: 'ab', nonce: '11111111-1111-4111-8111-111111111111' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const files = new Map(), calls = [], changes = []; let inode = 1000, clock = 100, launched;
  const row = (kind, data = '', mode = kind === 'directory' ? 0o700 : 0o644, extra = {}) => ({ kind, data, mode, uid: 0, ino: inode++, ...extra });
  const add = (path, kind, data, mode, extra) => files.set(path, row(kind, data, mode, extra));
  add('/tmp/private', 'directory'); add('/sys/module', 'directory');
  for (const name of ['bridge', 'br_netfilter', 'overlay', 'nf_conntrack', 'nf_nat', 'ip_tables', 'ip6_tables']) add('/sys/module/' + name, 'directory');
  add('/sys/fs/cgroup', 'directory'); add('/sys/fs/cgroup/cgroup.controllers', 'file', 'cpu memory pids io\n');
  add('/proc/self/ns/mnt', 'namespace', '', 0, { ino: 50 }); add('/proc/self/mountinfo', 'file', '1 0 0:1 / / rw - ext4 /dev/root rw\n');
  const toolchain = {};
  for (const role of ['python', 'containerd', 'dockerd', 'docker']) {
    const path = '/usr/bin/' + (role === 'python' ? 'python3' : role), bytes = Buffer.from('approved-' + role);
    add(path, 'file', bytes, 0o755);
    toolchain[role] = { path, sha256: digest(bytes), ...(role === 'python' ? {} : { version: role === 'containerd' ? '1.7.28' : '28.5.2' }) };
  }
  function value(path) { const found = files.get(path); if (!found) { const error = new Error('not found'); error.code = 'ENOENT'; throw error; } return found; }
  function stat(path) { const found = value(path); return { ...found, isDirectory: () => found.kind === 'directory', isFile: () => found.kind === 'file',
    isSymbolicLink: () => found.kind === 'symlink', isSocket: () => found.kind === 'socket' }; }
  function children(path) { return [...files.keys()].filter(name => name.startsWith(path + '/') && !name.slice(path.length + 1).includes('/')).map(name => name.slice(path.length + 1)); }
  function cgroup(path) { for (const [name, text] of Object.entries({ 'cgroup.controllers': 'cpu memory pids io\n', 'cgroup.procs': '', 'cgroup.events': 'populated 0\nfrozen 0\n', 'cgroup.subtree_control': '', 'cgroup.kill': '' })) add(path + '/' + name, 'file', text); }
  const fs = {
    lstatSync: stat, statSync: stat, uid: () => 0, now: () => clock,
    realpathSync: path => { value(path); return path; },
    mkdirSync: (path, options) => { changes.push(['mkdir', path]); if (files.has(path)) { const e = new Error('exists'); e.code = 'EEXIST'; throw e; } add(path, 'directory', '', options.mode); if (path.startsWith('/sys/fs/cgroup/')) cgroup(path); },
    readFileSync: (path, encoding) => { const data = value(path).data; return encoding ? Buffer.from(data).toString(encoding) : Buffer.from(data); },
    writeFileSync: (path, data, options) => { changes.push(['write', path, data]); if (options?.flag === 'wx' && files.has(path)) throw new Error('exists');
      if (path.endsWith('/cgroup.subtree_control')) data = data.replaceAll('+', '');
      if (path.endsWith('/cgroup.kill') && !h.killIgnored) { for (const [file, entry] of files) { if (file.startsWith(path.slice(0, -11)) && file.endsWith('/cgroup.procs')) entry.data = ''; if (file.startsWith(path.slice(0, -11)) && file.endsWith('/cgroup.events')) entry.data = 'populated 0\n'; } }
      if (files.has(path)) value(path).data = data; else add(path, 'file', data, options?.mode); },
    readdirSync: children,
    rmdirSync: path => { changes.push(['rmdir', path]); if (children(path).some(child => value(path + '/' + child).kind === 'directory')) throw new Error('not empty'); for (const key of [...files.keys()]) if (key === path || key.startsWith(path + '/')) files.delete(key); },
    rmSync: path => { changes.push(['rm', path]); for (const key of [...files.keys()]) if (key === path || key.startsWith(path + '/')) files.delete(key); },
  };
  function statText(pid, ticks = '777', cpu = '0') { const tail = Array(22).fill('0'); tail[0] = 'S'; tail[11] = cpu; tail[19] = ticks; return `${pid} (daemon) ${tail.join(' ')}\n`; }
  function proc(pid, argv) { add(`/proc/${pid}/stat`, 'file', statText(pid)); add(`/proc/${pid}/cmdline`, 'file', argv.join('\0') + '\0');
    add(`/proc/${pid}/ns/net`, 'namespace', '', 0, { ino: 90 }); add(`/proc/${pid}/ns/mnt`, 'namespace', '', 0, { ino: 200 });
    add(`/proc/${pid}/cgroup`, 'file', `0::/${launched.daemonCgroup.split('/').at(-2)}/daemons\n`); }
  const pin = {}, h = { files, calls, changes, fs, toolchain, pin, killIgnored: false, runFailure: false, infoChange: {}, launchLost: false,
    statText, add, proc, options: { binding, runnerTemp: '/tmp/private', pin, toolchain } };
  const ns = {
    observe: received => { assert.equal(received, pin); return { status: 'BOUNDARY_OBSERVED', binding: structuredClone(binding), anchor: { namespaceInode: 90 } }; },
    run: (received, executable, args) => { assert.equal(received, pin); calls.push({ executable, args });
      if (h.runFailure) throw new Error('untrusted output containing credentials');
      if (args[0] === '--version') return executable.endsWith('containerd') ? 'containerd github.com/containerd/containerd v1.7.28 abc\n' : 'Docker version 28.5.2, build abc\n';
      if (executable === '/usr/sbin/ip') return '';
      if (args.includes('info')) return JSON.stringify({ ID: 'private-daemon-id', DockerRootDir: launched.dockerd[launched.dockerd.indexOf('--data-root') + 1], CgroupDriver: 'cgroupfs', CgroupVersion: '2', ServerVersion: '28.5.2', ...h.infoChange });
      if (args[2].includes('Popen')) { launched = JSON.parse(args[3]); h.launched = launched;
        proc(101, launched.containerd); proc(102, launched.dockerd);
        value(launched.daemonCgroup + '/cgroup.procs').data = '101\n102\n';
        const root = launched.daemonCgroup.slice(0, -8); value(root + '/cgroup.events').data = 'populated 1\n';
        add(launched.containerdSocket, 'socket'); add(launched.dockerd[launched.dockerd.indexOf('--host') + 1].slice(7), 'socket');
        if (h.launchLost) throw new Error('launch response lost');
        return '{"containerd":101,"dockerd":102}'; }
      if (args[2].includes('SO_PEERCRED')) return JSON.stringify(h.peers ?? { containerd: { pid: 101, uid: 0, gid: 0 }, dockerd: { pid: 102, uid: 0, gid: 0 } });
      if (args[2].includes('pidfd_send_signal')) { const record = JSON.parse(args[3]);
        for (const key of [...files.keys()]) if (key.startsWith('/proc/' + record.pid + '/')) files.delete(key);
        value(launched.daemonCgroup + '/cgroup.procs').data = value(launched.daemonCgroup + '/cgroup.procs').data.replace(record.pid + '\n', '');
        if (!value(launched.daemonCgroup + '/cgroup.procs').data) value(launched.daemonCgroup.slice(0, -8) + '/cgroup.events').data = 'populated 0\n'; return '{}'; }
      throw new Error('unexpected command'); },
  };
  h.drivers = { fs, ns, wait: async ms => { clock += ms; } }; return h;
}
function prepared() { const h = fixture(); h.cap = createPrivateDockerBackend(h.options, h.drivers); return h; }
async function started() { const h = prepared(); h.result = await startPrivateDockerBackend(h.cap); return h; }

test('full mocked lifecycle uses private paths, explicit containerd and normal bridge without granting replay', async () => {
  const h = await started(); assert.equal(h.result.status, 'PRIVATE_DAEMONS_OBSERVED'); assert.equal(h.result.replay_authorized, false); assert.equal(h.result.runtime_validated, false);
  assert.equal(h.result.bridge, 'normal'); assert.match(h.result.dockerHost, /^unix:\/\/\/tmp\/private\/docker-/);
  const command = h.launched.dockerd;
  for (const flag of ['--containerd', '--containerd-namespace', '--containerd-plugins-namespace', '--data-root', '--exec-root', '--cgroup-parent', '--pidfile', '--default-cgroupns-mode']) assert.ok(command.includes(flag), flag);
  assert.ok(!command.includes('--internal')); assert.ok(command.includes('native.cgroupdriver=cgroupfs'));
  assert.ok(h.launched.containerd[2].startsWith('/tmp/private/docker-'));
  const info = h.calls.find(row => row.args.includes('info')); assert.ok(info.args.includes('--config')); assert.ok(info.args.includes('--host'));
  assert.equal((await cleanupPrivateDockerBackend(h.cap)).status, 'PRIVATE_DAEMONS_CLEANED');
  assert.ok(h.changes.filter(row => ['rm', 'rmdir'].includes(row[0])).every(row => row[1].startsWith('/tmp/private/docker-') || row[1].startsWith('/sys/fs/cgroup/liftgo-')));
});

test('preparation performs no daemon or network mutation calls', () => { const h = prepared(); assert.equal(h.calls.length, 0); assert.ok(h.changes.some(row => row[1].endsWith('/cgroup.subtree_control'))); });
test('requires all paired mocked drivers', () => { const h = fixture(); assert.throws(() => createPrivateDockerBackend(h.options, { fs: h.fs }), /PAIR_PRIVATE_BACKEND/); });
test('requires root before any privileged write', () => { const h = fixture(); h.fs.uid = () => 1001; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /REQUIRES_ROOT/); assert.deepEqual(h.changes, []); });
test('rejects fabricated backend capabilities without IO', () => { assert.throws(() => inspectPrivateDockerBackend(JSON.parse('{"kind":"PRIVATE_DOCKER_BACKEND"}')), /UNMINTED/); });
test('rejects tool digest mutation before any write', () => { const h = fixture(); h.files.get('/usr/bin/dockerd').data = 'changed'; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /TOOL_CHANGED/); assert.deepEqual(h.changes, []); });
test('rejects writable or symlink toolchain', () => { const h = fixture(); h.files.get('/usr/bin/docker').mode = 0o777; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /UNTRUSTED_DAEMON_TOOL/); });
test('rejects containerd2 config rather than guessing plugin support', () => { const h = fixture(); h.toolchain.containerd.version = '2.0.0'; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /CONFIG_VERSION_UNREVIEWED/); });
test('rejects mismatched Docker client and server versions', () => { const h = fixture(); h.toolchain.docker.version = '28.5.1'; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /VERSION_MISMATCH/); });
test('rejects foreign boundary SHA and profile', () => { const h = fixture(); h.drivers.ns.observe = () => ({ status: 'BOUNDARY_OBSERVED', binding: { ...binding, profile: 'rls' } }); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /BOUNDARY_BINDING_CHANGED/); });
test('rejects an unobserved boundary', () => { const h = fixture(); h.drivers.ns.observe = () => ({ status: 'UNKNOWN' }); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /BOUNDARY_BINDING_CHANGED/); });
test('rejects non-private runner folder', () => { const h = fixture(); h.files.get('/tmp/private').mode = 0o755; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /DIRECTORY_CHANGED/); });
test('rejects overlong Unix socket paths before mutation', () => { const h = fixture(), path = '/tmp/' + 'a'.repeat(80); h.add(path, 'directory'); h.options.runnerTemp = path; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /SOCKET_PATH_TOO_LONG/); assert.deepEqual(h.changes, []); });
test('does not reuse an existing private session', () => { const h = prepared(); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /exists/); });
test('requires cgroupv2 before mutation', () => { const h = fixture(); h.files.get('/sys/fs/cgroup/cgroup.controllers').data = ''; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /CGROUP_V2_REQUIRED/); assert.deepEqual(h.changes, []); });
test('rejects missing controllers and rolls back only its new empty scope', () => { const h = fixture(), mkdir = h.fs.mkdirSync; h.fs.mkdirSync = (path, opts) => { mkdir(path, opts); if (path.startsWith('/sys/fs/cgroup/')) h.files.get(path + '/cgroup.controllers').data = 'pids\n'; }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /CONTROLLERS_UNAVAILABLE/); assert.ok(![...h.files.keys()].some(path => path.startsWith('/sys/fs/cgroup/liftgo-'))); });
test('requires existing cgroup.kill facility before launch', () => { const h = fixture(), mkdir = h.fs.mkdirSync; h.fs.mkdirSync = (path, opts) => { mkdir(path, opts); if (path.startsWith('/sys/fs/cgroup/')) h.files.delete(path + '/cgroup.kill'); }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /not found/); assert.equal(h.calls.length, 0); });
test('requires controller readback rather than trusting write', () => { const h = fixture(), write = h.fs.writeFileSync; h.fs.writeFileSync = (path, data, opts) => { if (!path.endsWith('cgroup.subtree_control')) write(path, data, opts); }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /NOT_ENABLED/); });
test('never places daemon PIDs in cgroup root used by container subtree', async () => { const h = await started(); assert.ok(h.launched.daemonCgroup.endsWith('/daemons')); assert.ok(h.launched.dockerd[h.launched.dockerd.indexOf('--cgroup-parent') + 1].endsWith('/containers')); });
test('raises loopback before launching either daemon', async () => { const h = await started(); const ip = h.calls.findIndex(row => row.executable === '/usr/sbin/ip'); const launch = h.calls.findIndex(row => row.args[2]?.includes('Popen')); assert.ok(ip >= 0 && ip < launch); });
test('launcher creates shared private mount namespace before either Popen', async () => { const h = await started(), code = h.calls.find(row => row.args[2]?.includes('Popen')).args[2]; assert.ok(code.indexOf('libc.unshare') < code.indexOf('cd=start')); assert.ok(code.indexOf('libc.mount') < code.indexOf('cd=start')); assert.ok(code.includes('16384|262144')); assert.ok(code.includes('close_fds=True')); assert.ok(code.includes('preexec_fn=enter_cgroup')); assert.ok(code.includes('child.terminate()')); });
test('start failure sanitizes command error and retains cleanup capability', async () => { const h = prepared(); h.runFailure = true; await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED_CLEANUP_REQUIRED/); const result = await cleanupPrivateDockerBackend(h.cap); assert.equal(result.status, 'PRIVATE_DAEMONS_CLEANED'); });
test('lost launch response can clean its orphaned own cgroup without PID list', async () => { const h = prepared(); h.launchLost = true; await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED_CLEANUP_REQUIRED/); assert.equal((await cleanupPrivateDockerBackend(h.cap)).status, 'PRIVATE_DAEMONS_CLEANED'); assert.ok(h.changes.some(row => row[1].endsWith('/cgroup.kill'))); });
test('rejects double start', async () => { const h = await started(); await assert.rejects(startPrivateDockerBackend(h.cap), /PHASE_INVALID/); });
test('inspection requires live private daemons', () => { const h = prepared(); assert.throws(() => inspectPrivateDockerBackend(h.cap), /PHASE_INVALID/); });
for (const [name, mutate] of [
  ['PID start ticks changed', h => { h.files.get('/proc/102/stat').data = h.statText(102, '999'); }],
  ['foreign namespace', h => { h.files.get('/proc/102/ns/net').ino = 1; }],
  ['host mount namespace', h => { h.files.get('/proc/102/ns/mnt').ino = 50; }],
  ['split mount namespace', h => { h.files.get('/proc/102/ns/mnt').ino = 201; }],
  ['foreign cgroup', h => { h.files.get('/proc/102/cgroup').data = '0::/system.slice\n'; }],
  ['daemon command changed', h => { h.files.get('/proc/102/cmdline').data = 'other\0'; }],
  ['socket inode changed', h => { h.files.get(h.result.dockerHost.slice(7)).ino++; }],
  ['socket replaced by file', h => { h.files.get(h.result.dockerHost.slice(7)).kind = 'file'; }],
  ['directory inode changed', h => { h.files.get(h.result.dockerHost.slice(7).replace('/docker.sock', '')).ino++; }],
  ['cgroup inode changed', h => { h.files.get(h.result.cgroup).ino++; }],
  ['source config changed', h => { h.files.get(h.result.dockerHost.slice(7).replace('/docker.sock', '/daemon.json')).data = '{"hosts":["tcp://0.0.0.0:2375"]}'; }],
]) test('inspection fails closed: ' + name, async () => { const h = await started(); mutate(h); assert.throws(() => inspectPrivateDockerBackend(h.cap)); });
test('mutable CPU accounting does not invalidate unchanged process identity', async () => { const h = await started(), original = h.fs.readFileSync; let count = 0; h.fs.readFileSync = (path, encoding) => path.endsWith('/102/stat') ? h.statText(102, '777', String(++count)) : original(path, encoding); assert.equal(inspectPrivateDockerBackend(h.cap).status, 'PRIVATE_DAEMONS_OBSERVED'); });
for (const infoChange of [{ DockerRootDir: '/var/lib/docker' }, { CgroupDriver: 'systemd' }, { CgroupVersion: '1' }, { ServerVersion: '29.0.0' }, { ID: 'new-daemon-id' }]) test('inspection rejects daemon metadata change ' + JSON.stringify(infoChange), async () => { const h = await started(); h.infoChange = infoChange; assert.throws(() => inspectPrivateDockerBackend(h.cap)); });
test('cleanup refuses reused daemon PID and never sends a raw PID kill', async () => { const h = await started(); h.files.get('/proc/102/stat').data = h.statText(102, '999'); await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNPROVEN/); assert.ok(!h.calls.some(row => row.args[2]?.includes('pidfd_send_signal'))); await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNCERTAIN/); });
test('cleanup signalling uses pidfd validation and no shell', async () => { const h = await started(); await cleanupPrivateDockerBackend(h.cap); const calls = h.calls.filter(row => row.args[2]?.includes('pidfd_send_signal')); assert.equal(calls.length, 2); for (const row of calls) { assert.equal(row.executable, '/usr/bin/python3'); assert.ok(row.args[2].includes('os.pidfd_open')); assert.ok(row.args[2].includes("ticks!=record['startTicks']")); assert.ok(!row.args[2].includes('os.kill(')); } });
test('cleanup rejects replaced cgroup before mutating any process', async () => { const h = await started(); h.files.get(h.result.cgroup).ino++; const count = h.calls.length; await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNPROVEN/); assert.equal(h.calls.length, count); });
test('cleanup rejects lingering cgroup population and cannot later report success', async () => { const h = prepared(); h.launchLost = true; await assert.rejects(startPrivateDockerBackend(h.cap)); h.killIgnored = true; await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNPROVEN/); await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNCERTAIN/); });
test('cleanup refuses data removal under an unexpected visible mount', async () => { const h = await started(); h.files.get('/proc/self/mountinfo').data = `9 1 0:1 / ${h.result.dockerHost.slice(7).replace('/docker.sock', '')}/data rw - overlay overlay rw\n`; await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNPROVEN/); assert.ok(!h.changes.some(row => row[0] === 'rm')); });
test('prepared unused scope can be fully cleaned without launching a process', async () => { const h = prepared(); assert.equal((await cleanupPrivateDockerBackend(h.cap)).status, 'PRIVATE_DAEMONS_CLEANED'); assert.equal(h.calls.length, 0); });
test('closed backend cannot be reused or cleaned twice', async () => { const h = await started(); await cleanupPrivateDockerBackend(h.cap); assert.throws(() => inspectPrivateDockerBackend(h.cap), /PHASE_INVALID/); await assert.rejects(cleanupPrivateDockerBackend(h.cap), /CLEANUP_UNCERTAIN_OR_CLOSED/); });

test('requires kernel socket peer credentials to belong to exact owned daemon PID', async () => { const h = await started(); h.peers = { containerd: { pid: 101, uid: 0, gid: 0 }, dockerd: { pid: 900, uid: 0, gid: 0 } }; assert.throws(() => inspectPrivateDockerBackend(h.cap), /PEER_MISMATCH/); });
test('rejects nonroot socket peer', async () => { const h = await started(); h.peers = { containerd: { pid: 101, uid: 1000, gid: 1000 }, dockerd: { pid: 102, uid: 0, gid: 0 } }; assert.throws(() => inspectPrivateDockerBackend(h.cap), /PEER_MISMATCH/); });
test('rejects daemon binary replacement between prepare and start', async () => { const h = prepared(); h.files.get('/usr/bin/dockerd').data = 'replacement'; await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED/); assert.equal(h.calls.length, 0); });
test('rejects Docker CLI replacement after start before API call', async () => { const h = await started(); h.files.get('/usr/bin/docker').data = 'replacement'; const calls = h.calls.length; assert.throws(() => inspectPrivateDockerBackend(h.cap), /TOOL_CHANGED/); assert.equal(h.calls.length, calls); });

test('rejects state directories hidden by private run socket masks', () => { const h = fixture(); h.options.runnerTemp = '/run/private'; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /HIDDEN_BY_PRIVATE_RUNTIME_MASK/); assert.deepEqual(h.changes, []); });
test('rejects tool paths hidden by private runtime mask', () => { const h = fixture(); h.toolchain.python.path = '/run/python3'; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /HIDDEN_BY_PRIVATE_RUNTIME_MASK/); });
test('reobserves empty pinned namespace immediately before daemon launch', async () => { const h = prepared(); h.drivers.ns.observe = () => { throw new Error('uplink appeared'); }; await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED/); assert.equal(h.calls.length, 0); });
test('rejects changed anchor namespace even with same binding at prestart', async () => { const h = prepared(); h.drivers.ns.observe = () => ({ status: 'BOUNDARY_OBSERVED', binding, anchor: { namespaceInode: 999 } }); await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED/); assert.equal(h.calls.length, 0); });
test('launcher masks host runtime socket trees before either daemon starts', async () => { const h = await started(), code = h.calls.find(row => row.args[2]?.includes('Popen')).args[2]; assert.ok(code.indexOf("b'tmpfs'") < code.indexOf('cd=start')); for (const socket of ['/run/dbus/system_bus_socket', '/var/run/dbus/system_bus_socket', '/run/docker.sock', '/var/run/docker.sock', '/run/systemd/private']) assert.ok(code.includes(socket)); assert.ok(code.includes('DBUS_SYSTEM_BUS_ADDRESS')); assert.ok(h.launched.dbusAddress.startsWith('unix:path=/tmp/private/docker-')); assert.ok(!h.files.has(h.launched.dbusAddress.slice(10))); });

test('rejects whitespace and control characters in private paths', () => { for (const path of ['/tmp/a b', '/tmp/a\tb', '/tmp/a\nb']) { const h = fixture(); h.options.runnerTemp = path; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /INVALID_PRIVATE_BACKEND_PATH/); assert.deepEqual(h.changes, []); } });
test('requires minimum modules already present without loading any', () => { const h = fixture(); h.files.delete('/sys/module/bridge'); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /NOT_ALREADY_LOADED/); assert.equal(h.calls.length, 0); assert.deepEqual(h.changes, []); });
test('rejects kernel module inventory change between prepare and start', async () => { const h = prepared(); h.add('/sys/module/added', 'directory'); await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED/); assert.equal(h.calls.length, 0); });
test('inspection failure is sticky even after an altered binary is restored', async () => { const h = await started(), prior = h.files.get('/usr/bin/docker').data; h.files.get('/usr/bin/docker').data = 'changed'; assert.throws(() => inspectPrivateDockerBackend(h.cap), /TOOL_CHANGED/); h.files.get('/usr/bin/docker').data = prior; assert.throws(() => inspectPrivateDockerBackend(h.cap), /PHASE_INVALID/); });
test('cleanup never executes changed Python and still removes its own cgroup before returning FAIL', async () => { const h = await started(); h.files.get('/usr/bin/python3').data = 'changed'; const count = h.calls.length; await assert.rejects(cleanupPrivateDockerBackend(h.cap), error => error.code === 'PRIVATE_DAEMON_CLEANUP_UNPROVEN' && error.resourcesRemoved === true); assert.equal(h.calls.length, count); assert.ok(h.changes.some(row => row[1].endsWith('/cgroup.kill'))); await assert.rejects(cleanupPrivateDockerBackend(h.cap), /UNCERTAIN/); });
test('module changes never produce a cleanup PASS or attempt to unload modules', async () => { const h = await started(); h.add('/sys/module/new_module', 'directory'); await assert.rejects(cleanupPrivateDockerBackend(h.cap), error => error.code === 'PRIVATE_DAEMON_CLEANUP_UNPROVEN' && error.resourcesRemoved === true); assert.ok(!h.calls.some(row => row.executable.includes('modprobe') || row.executable.includes('rmmod'))); });
test('launcher masks explicit userland module loaders without claiming kernel autoload denial', async () => { const h = await started(), code = h.calls.find(row => row.args[2]?.includes('Popen')).args[2]; assert.ok(code.indexOf("module loader mask") < code.indexOf('cd=start')); assert.ok(code.includes("os.access(target,os.X_OK)")); assert.ok(code.includes('does NOT block')); assert.ok(code.includes("cfg['moduleBlocker']")); });
test('uncertain preparation rollback reports exact remaining own resources', () => { const h = fixture(), mkdir = h.fs.mkdirSync; h.fs.mkdirSync = (path, opts) => { mkdir(path, opts); if (path.startsWith('/sys/fs/cgroup/')) { h.files.get(path + '/cgroup.controllers').data = ''; h.files.get(path + '/cgroup.procs').data = '900\n'; } }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), error => error.rollbackComplete === false && error.pending_resources.directory.path.startsWith('/tmp/private/docker-') && Number.isSafeInteger(error.pending_resources.directory.inode) && error.pending_resources.cgroup.path.startsWith('/sys/fs/cgroup/liftgo-') && Number.isSafeInteger(error.pending_resources.cgroup.inode)); });

test('probes cgroup.kill writability only while the new owned subtree is verified empty', () => { const h = prepared(); const kill = h.changes.findIndex(row => row[1].endsWith('/cgroup.kill')); const leaf = h.changes.findIndex(row => row[0] === 'mkdir' && row[1].endsWith('/daemons')); assert.ok(kill >= 0 && kill < leaf); assert.equal(h.calls.length, 0); });
test('rejects unwritable cgroup.kill before any daemon starts', () => { const h = fixture(), write = h.fs.writeFileSync; h.fs.writeFileSync = (path, data, opts) => { if (path.endsWith('/cgroup.kill')) { const error = new Error('denied'); error.code = 'EACCES'; throw error; } write(path, data, opts); }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), error => error.code === 'EACCES' && error.rollbackComplete === true); assert.equal(h.calls.length, 0); });

test('reports exact private paths and inodes if preparation rollback rmdir fails', () => { const h = fixture(), mkdir = h.fs.mkdirSync; h.fs.mkdirSync = (path, opts) => { mkdir(path, opts); if (path.startsWith('/sys/fs/cgroup/')) h.files.get(path + '/cgroup.controllers').data = ''; }; h.fs.rmdirSync = () => { throw new Error('cannot rmdir'); }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), error => error.pending_resources.rollbackUnproven === true && error.pending_resources.directory.inode > 0 && error.pending_resources.cgroup.inode > 0); });
test('reports remaining private directory if preparation rollback rm fails', () => { const h = fixture(), mkdir = h.fs.mkdirSync; h.fs.mkdirSync = (path, opts) => { mkdir(path, opts); if (path.startsWith('/sys/fs/cgroup/')) h.files.get(path + '/cgroup.controllers').data = ''; }; h.fs.rmSync = () => { throw new Error('cannot rm'); }; assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), error => error.pending_resources.rollbackUnproven === true && error.pending_resources.directory.path.startsWith('/tmp/private/docker-') && error.pending_resources.cgroup === null); });

test('lost namespace pin during cleanup uses only owned cgroup kill and reports FAIL after collecting resources', async () => { const h = await started(); h.runFailure = true; await assert.rejects(cleanupPrivateDockerBackend(h.cap), error => error.code === 'PRIVATE_DAEMON_CLEANUP_UNPROVEN' && error.resourcesRemoved === true && error.pending_resources.directory === null && error.pending_resources.cgroup === null); assert.ok(h.changes.some(row => row[1].endsWith('/cgroup.kill'))); });

test('enabled AppArmor requires preexisting enforcing docker-default before any daemon or mutation', () => { const h = fixture(); h.add('/sys/module/apparmor/parameters/enabled', 'file', 'Y\n'); h.add('/sys/kernel/security/apparmor/profiles', 'file', 'other (enforce)\n'); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /DOCKER_DEFAULT_NOT_PREEXISTING/); assert.equal(h.calls.length, 0); assert.deepEqual(h.changes, []); });
test('enabled AppArmor with unreadable baseline fails before any daemon', () => { const h = fixture(); h.add('/sys/module/apparmor/parameters/enabled', 'file', 'Y\n'); assert.throws(() => createPrivateDockerBackend(h.options, h.drivers), /not found/); assert.equal(h.calls.length, 0); });
test('AppArmor baseline is freshly checked and cannot be replaced before start', async () => { const h = fixture(); h.add('/sys/module/apparmor/parameters/enabled', 'file', 'Y\n'); h.add('/sys/kernel/security/apparmor/profiles', 'file', 'docker-default (enforce)\n'); h.cap = createPrivateDockerBackend(h.options, h.drivers); h.files.get('/sys/kernel/security/apparmor/profiles').data += 'new (enforce)\n'; await assert.rejects(startPrivateDockerBackend(h.cap), /START_FAILED/); assert.equal(h.calls.length, 0); });
test('launcher makes securityfs read only in private mount namespace before daemons', async () => { const h = await started(), code = h.calls.find(row => row.args[2]?.includes('Popen')).args[2]; assert.ok(code.indexOf("readonly securityfs") < code.indexOf('cd=start')); assert.ok(code.includes('4096|32|1')); assert.ok(code.includes('os.ST_RDONLY')); assert.ok(!code.includes('unconfined')); });
test('AppArmor profile changes prevent cleanup PASS after owned resources are removed', async () => { const h = fixture(); h.add('/sys/module/apparmor/parameters/enabled', 'file', 'Y\n'); h.add('/sys/kernel/security/apparmor/profiles', 'file', 'docker-default (enforce)\n'); h.cap = createPrivateDockerBackend(h.options, h.drivers); await startPrivateDockerBackend(h.cap); h.files.get('/sys/kernel/security/apparmor/profiles').data += 'new (enforce)\n'; await assert.rejects(cleanupPrivateDockerBackend(h.cap), error => error.code === 'PRIVATE_DAEMON_CLEANUP_UNPROVEN' && error.resourcesRemoved === true); });
