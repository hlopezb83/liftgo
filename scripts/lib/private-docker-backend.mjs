// Privileged supervisor backend. Offline tests inject BOTH kernel and namespace IO.
// This module does not authorize Supabase, SQL, image pulls, or arbitrary PR code.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { observeEmptyBoundary, runInPinnedNamespace } from './owned-network-namespace.mjs';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const minted = new WeakSet(), states = new WeakMap();
const CGROOT = '/sys/fs/cgroup';
const CONTROLLERS = ['cpu', 'memory', 'pids'];
// Minimum preflight only: this is not a proof that the kernel cannot request
// another module. The no-SQL trial must review and compare the full inventory.
const REQUIRED_MODULES = ['bridge', 'br_netfilter', 'overlay', 'nf_conntrack', 'nf_nat', 'ip_tables', 'ip6_tables'];
const HEX64 = /^[a-f0-9]{64}$/;
const FS = Object.freeze({ lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync,
  uid: () => process.getuid(), now: () => Date.now() });
const NS = Object.freeze({ run: runInPinnedNamespace, observe: observeEmptyBoundary });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function need(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
function keys(value, fields, code) { need(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...fields].sort().join('\0'), code); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function drivers(options) {
  if (Object.keys(options).length === 0) return { fs: FS, ns: NS, wait: delay };
  keys(options, ['fs', 'ns', 'wait'], 'PAIR_PRIVATE_BACKEND_TEST_DRIVERS');
  keys(options.fs, Object.keys(FS), 'INVALID_PRIVATE_BACKEND_FS');
  keys(options.ns, Object.keys(NS), 'INVALID_PRIVATE_BACKEND_NAMESPACE');
  need([...Object.values(options.fs), ...Object.values(options.ns), options.wait].every(fn => typeof fn === 'function'), 'INVALID_PRIVATE_BACKEND_DRIVERS');
  return options;
}
function absolute(path) { need(typeof path === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) && posix.normalize(path) === path, 'INVALID_PRIVATE_BACKEND_PATH'); return path; }
function outsideMaskedRuntime(path) {
  need(!['/run', '/var/run'].some(root => path === root || path.startsWith(root + '/')), 'PATH_HIDDEN_BY_PRIVATE_RUNTIME_MASK');
}
function privateDir(fs, path, inode) {
  const row = fs.lstatSync(path);
  need(row.isDirectory() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o077) === 0 && fs.realpathSync(path) === path &&
    (inode === undefined || row.ino === inode), 'PRIVATE_BACKEND_DIRECTORY_CHANGED');
  return row.ino;
}
function cgroupIdentity(state) {
  const fs = state.fs, row = fs.lstatSync(state.paths.cgroup);
  need(row.isDirectory() && !row.isSymbolicLink() && row.uid === 0 && row.ino === state.cgroupInode &&
    fs.realpathSync(state.paths.cgroup) === state.paths.cgroup, 'PRIVATE_CGROUP_IDENTITY_CHANGED');
}
function sessionIdentity(state) {
  need(state.fs.uid() === 0, 'PRIVATE_BACKEND_REQUIRES_ROOT');
  privateDir(state.fs, state.paths.directory, state.directoryInode); cgroupIdentity(state);
  for (const [name, text] of Object.entries(state.configs)) need(state.fs.readFileSync(state.paths[name], 'utf8') === text, 'PRIVATE_DAEMON_CONFIG_CHANGED');
}
function plainFile(fs, path) {
  const row = fs.lstatSync(path);
  need(row.isFile() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o022) === 0 && (row.mode & 0o111) !== 0 && fs.realpathSync(path) === path, 'UNTRUSTED_DAEMON_TOOL');
}
function toolchain(fs, tools) {
  keys(tools, ['python', 'containerd', 'dockerd', 'docker'], 'INCOMPLETE_PRIVATE_TOOLCHAIN');
  const result = clone(tools);
  for (const [role, tool] of Object.entries(result)) {
    keys(tool, role === 'python' ? ['path', 'sha256'] : ['path', 'sha256', 'version'], 'INVALID_PRIVATE_TOOL');
    absolute(tool.path); outsideMaskedRuntime(tool.path); need(HEX64.test(tool.sha256), 'PRIVATE_TOOL_DIGEST_REQUIRED');
    plainFile(fs, tool.path); need(hash(fs.readFileSync(tool.path)) === tool.sha256, 'PRIVATE_TOOL_CHANGED');
    if (role !== 'python') need(/^\d+\.\d+\.\d+$/.test(tool.version), 'PRIVATE_TOOL_VERSION_REQUIRED');
  }
  // This implementation uses the reviewed containerd 1.7 config-v2 / CRI plugin ID.
  need(/^1\.7\./.test(result.containerd.version), 'CONTAINERD_CONFIG_VERSION_UNREVIEWED');
  need(result.docker.version === result.dockerd.version, 'DOCKER_CLIENT_SERVER_VERSION_MISMATCH');
  return result;
}
function modules(fs) {
  const rows = fs.readdirSync('/sys/module');
  need(rows.every(name => /^[A-Za-z0-9_]+$/.test(name)) && new Set(rows).size === rows.length, 'INVALID_KERNEL_MODULE_INVENTORY');
  return rows.sort();
}
function apparmor(fs) {
  let enabled;
  try { enabled = fs.readFileSync('/sys/module/apparmor/parameters/enabled', 'utf8').trim(); }
  catch (error) { if (error.code === 'ENOENT') return { enabled: false, profilesSha256: null }; throw error; }
  need(['Y', 'N'].includes(enabled), 'APPARMOR_STATE_UNMODELED');
  if (enabled === 'N') return { enabled: false, profilesSha256: null };
  const text = fs.readFileSync('/sys/kernel/security/apparmor/profiles', 'utf8');
  need(text.split('\n').includes('docker-default (enforce)'), 'APPARMOR_DOCKER_DEFAULT_NOT_PREEXISTING');
  return { enabled: true, profilesSha256: hash(text) };
}
function cgroupRows(fs, path) {
  const rows = [];
  function visit(directory) {
    for (const pid of fs.readFileSync(directory + '/cgroup.procs', 'utf8').trim().split(/\s+/).filter(Boolean)) {
      need(/^[1-9][0-9]*$/.test(pid), 'INVALID_OWNED_CGROUP_PID'); rows.push(Number(pid));
    }
    for (const name of fs.readdirSync(directory)) {
      need(name !== '.' && name !== '..' && !name.includes('/'), 'INVALID_CGROUP_ENTRY');
      const child = directory + '/' + name, stat = fs.lstatSync(child);
      need(!stat.isSymbolicLink(), 'SYMLINK_IN_OWNED_CGROUP');
      if (stat.isDirectory()) visit(child);
    }
  }
  visit(path); return [...new Set(rows)].sort((a, b) => a - b);
}
function processIdentity(state, pid) {
  need(Number.isSafeInteger(pid) && pid > 1, 'INVALID_DAEMON_PID');
  const fs = state.fs, stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  need(stat.startsWith(`${pid} (`), 'PRIVATE_DAEMON_PROCESS_CHANGED');
  const tail = stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/\s+/);
  need(tail.length >= 20 && /^[1-9][0-9]*$/.test(tail[19]) && !['Z', 'X', 'x'].includes(tail[0]), 'PRIVATE_DAEMON_PROCESS_CHANGED');
  const argv = fs.readFileSync(`/proc/${pid}/cmdline`).toString('utf8').replace(/\0$/, '').split('\0');
  const network = fs.statSync(`/proc/${pid}/ns/net`).ino, mount = fs.statSync(`/proc/${pid}/ns/mnt`).ino;
  const cgroup = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf8');
  need(cgroup === `0::/${state.paths.cgroup.split('/').at(-1)}/daemons\n`, 'PRIVATE_DAEMON_CGROUP_CHANGED');
  const again = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  need(again.startsWith(`${pid} (`) && again.slice(again.lastIndexOf(') ') + 2).trim().split(/\s+/)[19] === tail[19], 'PRIVATE_DAEMON_PROCESS_CHANGED');
  return { pid, startTicks: tail[19], namespaceInode: network, mountNamespaceInode: mount, argv };
}
function daemonIdentity(state) {
  sessionIdentity(state); need(state.processes, 'PRIVATE_DAEMONS_NOT_STARTED');
  const result = {};
  for (const role of ['containerd', 'dockerd']) {
    const row = processIdentity(state, state.processes[role].pid);
    need(JSON.stringify(row) === JSON.stringify(state.processes[role]) && row.namespaceInode === state.namespaceInode &&
      row.mountNamespaceInode !== state.hostMountNamespaceInode && JSON.stringify(row.argv) === JSON.stringify(state.commands[role]), 'PRIVATE_DAEMON_IDENTITY_CHANGED');
    result[role] = row;
  }
  need(result.containerd.mountNamespaceInode === result.dockerd.mountNamespaceInode, 'PRIVATE_DAEMON_MOUNT_NAMESPACE_SPLIT');
  for (const socket of [state.paths.containerdSocket, state.paths.dockerSocket]) {
    const row = state.fs.lstatSync(socket);
    need(row.isSocket() && !row.isSymbolicLink() && row.uid === 0 && state.fs.realpathSync(socket) === socket, 'PRIVATE_DAEMON_SOCKET_UNPROVEN');
    if (state.socketInodes) need(row.ino === state.socketInodes[socket], 'PRIVATE_DAEMON_SOCKET_CHANGED');
  }
  return result;
}
function live(cap, phases) {
  need(cap && typeof cap === 'object' && minted.has(cap), 'UNMINTED_PRIVATE_DOCKER_BACKEND');
  const state = states.get(cap); need(!state.busy && phases.includes(state.phase), 'PRIVATE_BACKEND_PHASE_INVALID');
  sessionIdentity(state); return state;
}

// Executed only by the reviewed privileged supervisor, inside the pinned outer netns.
// Both daemons inherit ONE new private mount namespace; host mounts cannot propagate.
// Child PIDs are placed below an empty session root, preserving cgroup-v2 topology.
const LAUNCH = String.raw`
import ctypes, json, os, stat, subprocess, sys, time
cfg=json.loads(sys.argv[1])
libc=ctypes.CDLL(None,use_errno=True)
if libc.unshare(0x00020000)!=0: raise OSError(ctypes.get_errno(),'mount namespace')
if libc.mount(None,b'/',None,16384|262144,None)!=0: raise OSError(ctypes.get_errno(),'private mounts')
# Network namespaces do not isolate pathname Unix sockets. Mask the supervisor's
# runtime socket trees before either daemon can consult firewalld or systemd.
if not os.path.isdir('/run') or os.path.islink('/run'): raise RuntimeError('unsupported run tree')
var_run='/var/run'
if os.path.islink(var_run):
    if os.path.realpath(var_run)!='/run': raise RuntimeError('unsupported var/run alias')
    var_run=None
elif not os.path.isdir(var_run): raise RuntimeError('unsupported var/run tree')
for target in ['/run']+([var_run] if var_run else []):
    if libc.mount(b'tmpfs',target.encode(),b'tmpfs',14,b'mode=755,size=16m')!=0: raise OSError(ctypes.get_errno(),'private runtime mask')
# Preserve the already-loaded AppArmor policy. A read-only private bind prevents
# a trusted daemon from loading/replacing profiles through securityfs.
security='/sys/kernel/security'
if os.path.isdir(security):
    if libc.mount(security.encode(),security.encode(),None,4096,None)!=0: raise OSError(ctypes.get_errno(),'private securityfs bind')
    if libc.mount(None,security.encode(),None,4096|32|1,None)!=0: raise OSError(ctypes.get_errno(),'readonly securityfs')
    if not os.statvfs(security).f_flag & os.ST_RDONLY: raise RuntimeError('securityfs not read only')
elif cfg['apparmorEnabled']: raise RuntimeError('AppArmor securityfs missing')
# Deny explicit userland module-loader execution inside this mount namespace.
# This does NOT block the kernel's global request_module/usermodehelper path.
loaders=set()
for candidate in ['/sbin/modprobe','/usr/sbin/modprobe','/bin/modprobe','/usr/bin/modprobe']:
    if os.path.lexists(candidate):
        target=os.path.realpath(candidate)
        if not os.path.isfile(target): raise RuntimeError('unsupported module loader')
        loaders.add(target)
for target in loaders:
    if libc.mount(cfg['moduleBlocker'].encode(),target.encode(),None,4096,None)!=0: raise OSError(ctypes.get_errno(),'module loader mask')
    if os.access(target,os.X_OK): raise RuntimeError('module loader remains executable')
for target in ['/run/dbus/system_bus_socket','/var/run/dbus/system_bus_socket','/run/docker.sock','/var/run/docker.sock','/run/systemd/private','/var/run/systemd/private']:
    if os.path.lexists(target): raise RuntimeError('host runtime socket remains visible')
def enter_cgroup():
    with open(cfg['daemonCgroup']+'/cgroup.procs','w') as f: f.write(str(os.getpid()))
def start(argv,log):
    fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try: return subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=fd,stderr=fd,close_fds=True,start_new_session=True,preexec_fn=enter_cgroup,env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','LANG':'C.UTF-8','TZ':'UTC','DBUS_SYSTEM_BUS_ADDRESS':cfg['dbusAddress']})
    finally: os.close(fd)
children=[]
try:
    cd=start(cfg['containerd'],cfg['containerdLog']); children.append(cd)
    deadline=time.monotonic()+8
    while not os.path.exists(cfg['containerdSocket']):
        if cd.poll() is not None or time.monotonic()>deadline: raise RuntimeError('containerd not ready')
        time.sleep(.05)
    if not stat.S_ISSOCK(os.stat(cfg['containerdSocket']).st_mode): raise RuntimeError('not private containerd socket')
    dk=start(cfg['dockerd'],cfg['dockerdLog']); children.append(dk)
    print(json.dumps({'containerd':cd.pid,'dockerd':dk.pid}),flush=True)
except BaseException:
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=1)
            except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=1)
    raise
`;
const PEERS = String.raw`
import json, socket, struct, sys
result={}
for role,path in json.loads(sys.argv[1]).items():
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sock:
        sock.settimeout(1); sock.connect(path)
        pid,uid,gid=struct.unpack('3i',sock.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize('3i')))
        result[role]={'pid':pid,'uid':uid,'gid':gid}
print(json.dumps(result))
`;
function socketPeers(state) {
  const output = state.ns.run(state.pin, state.tools.python.path, ['-I', '-c', PEERS, JSON.stringify({
    containerd: state.paths.containerdSocket, dockerd: state.paths.dockerSocket,
  })]);
  const peers = JSON.parse(output); keys(peers, ['containerd', 'dockerd'], 'PRIVATE_SOCKET_PEER_UNPROVEN');
  for (const role of ['containerd', 'dockerd']) {
    keys(peers[role], ['pid', 'uid', 'gid'], 'PRIVATE_SOCKET_PEER_UNPROVEN');
    need(peers[role].pid === state.processes[role].pid && peers[role].uid === 0 && Number.isSafeInteger(peers[role].gid) && peers[role].gid >= 0, 'PRIVATE_SOCKET_PEER_MISMATCH');
  }
}
const SIGNAL = String.raw`
import json, os, signal, sys
record=json.loads(sys.argv[1]); pid=record['pid']
fd=os.pidfd_open(pid,0)
try:
    with open('/proc/'+str(pid)+'/stat') as f: s=f.read()
    ticks=s[s.rfind(') ')+2:].split()[19]
    if ticks!=record['startTicks']: raise RuntimeError('PID reused')
    if os.stat('/proc/'+str(pid)+'/ns/net').st_ino!=record['namespaceInode']: raise RuntimeError('namespace changed')
    if os.stat('/proc/'+str(pid)+'/ns/mnt').st_ino!=record['mountNamespaceInode']: raise RuntimeError('mount namespace changed')
    with open('/proc/'+str(pid)+'/cgroup') as f: cg=f.read()
    if cg!=record['cgroup']: raise RuntimeError('cgroup changed')
    signal.pidfd_send_signal(fd,signal.SIGTERM,None,0)
finally: os.close(fd)
print('{}')
`;

export function createPrivateDockerBackend({ binding, runnerTemp, pin, toolchain: supplied }, options = {}) {
  const context = validateBinding(binding), io = drivers(options), fs = io.fs;
  need(fs.uid() === 0, 'PRIVATE_BACKEND_REQUIRES_ROOT');
  absolute(runnerTemp); outsideMaskedRuntime(runnerTemp); privateDir(fs, runnerTemp);
  const tools = toolchain(fs, supplied), baselineModules = modules(fs), baselineAppArmor = apparmor(fs), boundary = io.ns.observe(pin);
  need(REQUIRED_MODULES.every(name => baselineModules.includes(name)), 'REQUIRED_KERNEL_MODULE_NOT_ALREADY_LOADED');
  need(boundary.status === 'BOUNDARY_OBSERVED' && JSON.stringify(boundary.binding) === JSON.stringify(context), 'PRIVATE_BOUNDARY_BINDING_CHANGED');
  const suffix = hash(JSON.stringify(context)).slice(0, 20), directory = runnerTemp + '/docker-' + suffix;
  const cgroup = CGROOT + '/liftgo-' + suffix;
  need(fs.readFileSync(CGROOT + '/cgroup.controllers', 'utf8').trim().split(/\s+/).includes('pids'), 'CGROUP_V2_REQUIRED');
  const paths = { directory, cgroup, containerdRoot: directory + '/cd-root', containerdState: directory + '/cd-state',
    dataRoot: directory + '/data', execRoot: directory + '/exec', dockerSocket: directory + '/docker.sock',
    containerdSocket: directory + '/containerd.sock', containerdConfig: directory + '/containerd.toml',
    dockerdConfig: directory + '/daemon.json', moduleBlocker: directory + '/blocked-module-loader', clientConfig: directory + '/client/config.json', clientDirectory: directory + '/client', pidfile: directory + '/dockerd.pid' };
  need(Buffer.byteLength(paths.dockerSocket) < 100 && Buffer.byteLength(paths.containerdSocket) < 100, 'PRIVATE_SOCKET_PATH_TOO_LONG');
  fs.mkdirSync(directory, { mode: 0o700 });
  const state = { ...io, pin, binding: context, paths, tools, baselineModules, baselineAppArmor, phase: 'preparing', busy: false,
    directoryInode: privateDir(fs, directory), namespaceInode: boundary.anchor.namespaceInode,
    hostMountNamespaceInode: fs.statSync('/proc/self/ns/mnt').ino, processes: null, socketInodes: null, cleanupUncertain: false };
  const cap = Object.freeze({ kind: 'PRIVATE_DOCKER_BACKEND', replay_authorized: false });
  minted.add(cap); states.set(cap, state);
  try {
    fs.mkdirSync(cgroup, { mode: 0o700 }); state.cgroupInode = fs.lstatSync(cgroup).ino;
    need(fs.lstatSync(cgroup + '/cgroup.kill').isFile(), 'CGROUP_KILL_REQUIRED');
    const available = fs.readFileSync(cgroup + '/cgroup.controllers', 'utf8').trim().split(/\s+/);
    need(CONTROLLERS.every(name => available.includes(name)), 'CGROUP_CONTROLLERS_UNAVAILABLE');
    need(fs.readFileSync(cgroup + '/cgroup.procs', 'utf8').trim() === '', 'OWNED_CGROUP_NOT_EMPTY');
    fs.writeFileSync(cgroup + '/cgroup.subtree_control', CONTROLLERS.map(name => '+' + name).join(' '));
    need(CONTROLLERS.every(name => fs.readFileSync(cgroup + '/cgroup.subtree_control', 'utf8').trim().split(/\s+/).includes(name)), 'CGROUP_CONTROLLERS_NOT_ENABLED');
    // Probe the kill facility on this newly-created, verified-empty subtree.
    fs.writeFileSync(cgroup + '/cgroup.kill', '1');
    need(cgroupRows(fs, cgroup).length === 0 && /^populated 0$/m.test(fs.readFileSync(cgroup + '/cgroup.events', 'utf8')), 'EMPTY_CGROUP_KILL_PROBE_UNPROVEN');
    for (const name of ['daemons', 'containers', 'native']) fs.mkdirSync(cgroup + '/' + name, { mode: 0o700 });
    for (const path of [paths.containerdRoot, paths.containerdState, paths.dataRoot, paths.execRoot, paths.clientDirectory]) fs.mkdirSync(path, { mode: 0o700 });
    state.configs = { containerdConfig: `version = 2\nroot = ${JSON.stringify(paths.containerdRoot)}\nstate = ${JSON.stringify(paths.containerdState)}\ndisabled_plugins = ["io.containerd.grpc.v1.cri"]\n[grpc]\naddress = ${JSON.stringify(paths.containerdSocket)}\n`, dockerdConfig: '{}\n', clientConfig: '{}\n', moduleBlocker: 'Explicit module loading is disabled in this private daemon session.\n' };
    for (const [key, text] of Object.entries(state.configs)) fs.writeFileSync(paths[key], text, { flag: 'wx', mode: 0o600 });
    const namespace = 'lg' + suffix;
    state.commands = {
      containerd: [tools.containerd.path, '--config', paths.containerdConfig],
      dockerd: [tools.dockerd.path, '--config-file', paths.dockerdConfig, '--host', 'unix://' + paths.dockerSocket,
        '--containerd', paths.containerdSocket, '--containerd-namespace', namespace, '--containerd-plugins-namespace', namespace + 'p',
        '--data-root', paths.dataRoot, '--exec-root', paths.execRoot, '--pidfile', paths.pidfile,
        '--cgroup-parent', '/' + cgroup.split('/').at(-1) + '/containers', '--exec-opt', 'native.cgroupdriver=cgroupfs',
        '--default-cgroupns-mode', 'private', '--userland-proxy=true', '--iptables=true', '--ip6tables=true'],
    };
    state.phase = 'prepared'; sessionIdentity(state); return cap;
  } catch (error) {
    // No daemon was invoked. A partial cgroup or directory is retained if removal
    // cannot be proved safe; creation never disguises a failed rollback as success.
    state.phase = 'prepare-failed';
    try {
      if (state.cgroupInode) { cgroupIdentity(state); need(cgroupRows(fs, cgroup).length === 0, 'PARTIAL_CGROUP_POPULATED'); removeCgroupTree(state, cgroup); state.cgroupRemoved = true; }
      fs.rmSync(directory, { recursive: true, force: false }); state.phase = 'closed';
    } catch { state.cleanupUncertain = true; }
    error.rollbackComplete = state.phase === 'closed';
    error.pending_resources = { phase: state.phase, rollbackUnproven: state.phase !== 'closed',
      directory: state.phase === 'closed' ? null : { path: directory, inode: state.directoryInode },
      cgroup: state.phase === 'closed' || state.cgroupRemoved || !state.cgroupInode ? null : { path: cgroup, inode: state.cgroupInode } };
    throw error;
  }
}

export async function startPrivateDockerBackend(cap) {
  const state = live(cap, ['prepared']); state.phase = 'starting'; state.busy = true;
  try {
    need(cgroupRows(state.fs, state.paths.cgroup).length === 0, 'OWNED_CGROUP_NOT_EMPTY');
    toolchain(state.fs, state.tools); // Reject binary replacement after preparation.
    need(JSON.stringify(modules(state.fs)) === JSON.stringify(state.baselineModules), 'KERNEL_MODULE_INVENTORY_CHANGED');
    need(JSON.stringify(apparmor(state.fs)) === JSON.stringify(state.baselineAppArmor), 'APPARMOR_STATE_CHANGED');
    const boundary = state.ns.observe(state.pin);
    need(boundary.status === 'BOUNDARY_OBSERVED' && JSON.stringify(boundary.binding) === JSON.stringify(state.binding) &&
      boundary.anchor.namespaceInode === state.namespaceInode, 'PRIVATE_PRESTART_BOUNDARY_CHANGED');
    for (const role of ['containerd', 'dockerd', 'docker']) {
      const output = state.ns.run(state.pin, state.tools[role].path, ['--version']);
      need(new RegExp('(?:^|[ ,v])' + state.tools[role].version.replaceAll('.', '\\.') + '(?:[ ,\\n]|$)').test(output), 'PRIVATE_TOOL_VERSION_CHANGED');
    }
    state.ns.run(state.pin, '/usr/sbin/ip', ['link', 'set', 'dev', 'lo', 'up']);
    const output = state.ns.run(state.pin, state.tools.python.path, ['-I', '-c', LAUNCH, JSON.stringify({
      daemonCgroup: state.paths.cgroup + '/daemons', moduleBlocker: state.paths.moduleBlocker, apparmorEnabled: state.baselineAppArmor.enabled, dbusAddress: 'unix:path=' + state.paths.directory + '/disabled-dbus.sock', containerd: state.commands.containerd, dockerd: state.commands.dockerd,
      containerdLog: state.paths.directory + '/containerd.log', dockerdLog: state.paths.directory + '/dockerd.log', containerdSocket: state.paths.containerdSocket,
    })]);
    const pids = JSON.parse(output); keys(pids, ['containerd', 'dockerd'], 'PRIVATE_DAEMON_LAUNCH_UNPROVEN');
    state.processes = Object.fromEntries(Object.entries(pids).map(([role, pid]) => [role, processIdentity(state, pid)]));
    const deadline = state.fs.now() + 8_000;
    while (true) {
      try { daemonIdentity(state); socketPeers(state); break; }
      catch { need(state.fs.now() < deadline, 'PRIVATE_DAEMON_STARTUP_UNPROVEN'); await state.wait(50); }
    }
    state.socketInodes = Object.fromEntries([state.paths.containerdSocket, state.paths.dockerSocket].map(path => [path, state.fs.lstatSync(path).ino]));
    state.phase = 'started'; state.busy = false;
    return inspectPrivateDockerBackend(cap);
  } catch {
    state.phase = 'start-failed'; state.busy = false;
    // The caller retains the capability to collect even an orphan whose launch
    // response was lost. No JSON process list is needed to own this cgroup.
    need(false, 'PRIVATE_DAEMON_START_FAILED_CLEANUP_REQUIRED');
  }
}

export function inspectPrivateDockerBackend(cap) {
  const state = live(cap, ['started']);
  try {
  need(JSON.stringify(modules(state.fs)) === JSON.stringify(state.baselineModules), 'KERNEL_MODULE_INVENTORY_CHANGED');
  need(JSON.stringify(apparmor(state.fs)) === JSON.stringify(state.baselineAppArmor), 'APPARMOR_STATE_CHANGED');
  toolchain(state.fs, state.tools); daemonIdentity(state); socketPeers(state);
  const output = state.ns.run(state.pin, state.tools.docker.path,
    ['--config', state.paths.clientDirectory, '--host', 'unix://' + state.paths.dockerSocket, 'info', '--format', '{{json .}}']);
  const info = JSON.parse(output);
  need(typeof info.ID === 'string' && /^[A-Za-z0-9:._-]{8,128}$/.test(info.ID) && info.DockerRootDir === state.paths.dataRoot &&
    info.CgroupDriver === 'cgroupfs' && info.CgroupVersion === '2' && info.ServerVersion === state.tools.dockerd.version,
  'PRIVATE_DAEMON_INFO_MISMATCH');
  if (state.daemonId) need(info.ID === state.daemonId, 'PRIVATE_DAEMON_ID_CHANGED');
  state.daemonId = info.ID; daemonIdentity(state);
  return { schema_version: 1, status: 'PRIVATE_DAEMONS_OBSERVED', binding: clone(state.binding),
    dockerHost: 'unix://' + state.paths.dockerSocket, daemonId: info.ID, namespaceInode: state.namespaceInode,
    mountNamespaceInode: state.processes.dockerd.mountNamespaceInode, cgroup: state.paths.cgroup,
    bridge: 'normal', kernelModuleInventorySha256: hash(JSON.stringify(state.baselineModules)), apparmor: clone(state.baselineAppArmor),
    replay_authorized: false, runtime_validated: false };
  } catch (error) { state.phase = 'observation-failed'; throw error; }
}

function removeCgroupTree(state, directory) {
  for (const name of state.fs.readdirSync(directory)) {
    const path = directory + '/' + name, row = state.fs.lstatSync(path);
    need(!row.isSymbolicLink(), 'SYMLINK_IN_OWNED_CGROUP');
    if (row.isDirectory()) removeCgroupTree(state, path);
  }
  state.fs.rmdirSync(directory);
}
function noOwnedMounts(state) {
  // A private daemon mount namespace must disappear with its processes. Do not
  // remove data underneath an unexpected mount visible to the supervisor.
  const text = state.fs.readFileSync('/proc/self/mountinfo', 'utf8');
  for (const line of text.trim().split('\n').filter(Boolean)) {
    const mountpoint = line.split(' ')[4]?.replaceAll('\\040', ' ').replaceAll('\\134', '\\');
    need(typeof mountpoint === 'string' && mountpoint !== state.paths.directory && !mountpoint.startsWith(state.paths.directory + '/'), 'OWNED_MOUNT_REMAINS');
  }
}
export async function cleanupPrivateDockerBackend(cap) {
  need(cap && minted.has(cap), 'UNMINTED_PRIVATE_DOCKER_BACKEND'); const state = states.get(cap);
  need(!state.busy && state.phase !== 'closed' && !state.cleanupUncertain, 'PRIVATE_BACKEND_CLEANUP_UNCERTAIN_OR_CLOSED');
  state.busy = true;
  try {
    sessionIdentity(state); state.phase = 'cleaning';
    let toolsTrusted = true, graceUnproven = false;
    try { toolchain(state.fs, state.tools); } catch { toolsTrusted = false; }
    if (state.processes && toolsTrusted) {
      for (const role of ['dockerd', 'containerd']) {
        try {
          const record = processIdentity(state, state.processes[role].pid);
          need(JSON.stringify(record) === JSON.stringify(state.processes[role]), 'PRIVATE_DAEMON_IDENTITY_CHANGED');
          state.ns.run(state.pin, state.tools.python.path, ['-I', '-c', SIGNAL, JSON.stringify({ ...record,
            cgroup: `0::/${state.paths.cgroup.split('/').at(-1)}/daemons\n` })]);
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ESRCH') { graceUnproven = true; break; }
        }
      }
      for (let index = 0; index < 20 && cgroupRows(state.fs, state.paths.cgroup).length; index++) await state.wait(50);
    }
    cgroupIdentity(state);
    if (cgroupRows(state.fs, state.paths.cgroup).length) {
      // Only the exclusively-created cgroup subtree is affected. Never global kill,
      // kill(-pgid), a JSON-supplied PID list, or the system Docker daemon.
      state.fs.writeFileSync(state.paths.cgroup + '/cgroup.kill', '1');
      for (let index = 0; index < 20 && cgroupRows(state.fs, state.paths.cgroup).length; index++) await state.wait(50);
    }
    need(cgroupRows(state.fs, state.paths.cgroup).length === 0 &&
      /^populated 0$/m.test(state.fs.readFileSync(state.paths.cgroup + '/cgroup.events', 'utf8')), 'OWNED_CGROUP_REMAINS_POPULATED');
    noOwnedMounts(state); cgroupIdentity(state); removeCgroupTree(state, state.paths.cgroup); state.cgroupRemoved = true;
    privateDir(state.fs, state.paths.directory, state.directoryInode); state.fs.rmSync(state.paths.directory, { recursive: true, force: false });
    state.resourcesRemoved = true;
    need(toolsTrusted && !graceUnproven, 'CLEANED_WITH_UNPROVEN_GRACE_OR_TOOLCHAIN');
    need(JSON.stringify(modules(state.fs)) === JSON.stringify(state.baselineModules), 'KERNEL_MODULE_INVENTORY_CHANGED');
    need(JSON.stringify(apparmor(state.fs)) === JSON.stringify(state.baselineAppArmor), 'APPARMOR_STATE_CHANGED');
    state.phase = 'closed'; state.busy = false;
    return { status: 'PRIVATE_DAEMONS_CLEANED', replay_authorized: false, binding: clone(state.binding), runtime_validated: false };
  } catch {
    state.cleanupUncertain = true; state.busy = false; state.phase = 'cleanup-failed';
    const error = new Error('PRIVATE_DAEMON_CLEANUP_UNPROVEN'); error.code = 'PRIVATE_DAEMON_CLEANUP_UNPROVEN';
    error.resourcesRemoved = state.resourcesRemoved === true;
    error.pending_resources = { phase: state.phase, rollbackUnproven: true,
      directory: error.resourcesRemoved ? null : { path: state.paths.directory, inode: state.directoryInode },
      cgroup: error.resourcesRemoved || state.cgroupRemoved ? null : { path: state.paths.cgroup, inode: state.cgroupInode } };
    throw error;
  }
}
