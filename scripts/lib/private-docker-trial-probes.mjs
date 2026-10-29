// Inert local probes only. This module never grants SQL/replay authorization.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { posix } from 'node:path';
import { isIP } from 'node:net';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';
import { runInPinnedNamespace } from './owned-network-namespace.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const HEX = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FS = Object.freeze({ lstatSync, readFileSync, realpathSync, unlinkSync, uid: () => process.getuid() });
const DEFAULTS = Object.freeze({ fs: FS, execute: execFileSync, run: runInPinnedNamespace, now: () => Date.now() });
const payloads = new WeakMap();
const ROLES = ['ipv4', 'ipv6', 'dnsLoopUdp', 'dnsLoopTcp', 'dnsNonLoopUdp', 'dnsNonLoopTcp', 'ipv6Benchmark'];
export const REQUIRED_TRIAL_PROBE_CONTROLS = Object.freeze(['daemon-host', 'sandbox-override'].flatMap(route =>
  [...ROLES.map(role => 'direct-' + role), 'dns-udp-upstream', 'dns-tcp-upstream'].map(name => route + ':' + name)));
function need(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function keys(value, expected, code) { need(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...expected].sort().join(), code); }
function io(options) {
  if (Object.keys(options).length === 0) return { ...DEFAULTS, fixture: false };
  keys(options, ['fs', 'execute', 'run', 'now'], 'PAIR_ALL_TRIAL_PROBE_DRIVERS'); keys(options.fs, Object.keys(FS), 'PAIR_ALL_TRIAL_PROBE_DRIVERS');
  need([...Object.values(options.fs), options.execute, options.run, options.now].every(value => typeof value === 'function'), 'INVALID_TRIAL_PROBE_DRIVERS');
  return { ...options, fixture: true };
}
function path(value) { need(typeof value === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(value) && posix.normalize(value) === value, 'INVALID_TRIAL_PROBE_PATH'); return value; }
function privateDirectory(fs, directory) {
  path(directory); const row = fs.lstatSync(directory);
  need(row.isDirectory() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o077) === 0 && fs.realpathSync(directory) === directory, 'PRIVATE_TRIAL_PAYLOAD_DIRECTORY_REQUIRED');
}
function archiveBytes(state) {
  const row = state.fs.lstatSync(state.archivePath);
  need(row.isFile() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o077) === 0 && state.fs.realpathSync(state.archivePath) === state.archivePath &&
    (state.archiveInode === undefined || row.ino === state.archiveInode), 'PRIVATE_TRIAL_ARCHIVE_REQUIRED');
  return state.fs.readFileSync(state.archivePath);
}

// Runs only while assembling the future local payload. No registry, package
// manager, site packages, host secrets or runtime socket trees are included.
const ASSEMBLE = String.raw`
import hashlib, io, json, os, pathlib, re, stat, subprocess, sys, sysconfig, tarfile
cfg=json.loads(sys.argv[1]); archive=pathlib.Path(cfg['archive']); files={}
def add(source):
    alias=pathlib.Path(os.path.abspath(source));source=alias.resolve(strict=True)
    s=source.stat()
    if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or s.st_mode&0o022: raise RuntimeError('untrusted payload source')
    if not re.fullmatch(r'/[A-Za-z0-9_./+-]+',str(source)): raise RuntimeError('unsupported source path')
    files[str(source)]=source;files[str(alias)]=source
python=pathlib.Path(sys.executable).resolve(strict=True); add(python)
stdlib=pathlib.Path(sysconfig.get_path('stdlib')).resolve(strict=True)
for base,dirs,names in os.walk(stdlib,followlinks=False):
    dirs[:]=[name for name in dirs if name not in ('site-packages','dist-packages','__pycache__','test','tests','idlelib','tkinter','ensurepip') and not pathlib.Path(base,name).is_symlink()]
    for name in names:
        item=pathlib.Path(base,name)
        if item.is_symlink(): continue
        if name.endswith(('.py','.so')): add(item)
for item in list(files.values()):
    if item!=python and not str(item).endswith('.so'): continue
    out=subprocess.run(['/usr/bin/ldd',str(item)],check=True,text=True,capture_output=True,env={'PATH':'/usr/bin:/bin','LANG':'C'}).stdout
    for line in out.splitlines():
        if 'not found' in line: raise RuntimeError('payload dependency missing')
        for candidate in re.findall(r'(?:=>\s+|^\s*)(/[^\s]+)',line): add(candidate)
with tarfile.open(archive,'x',format=tarfile.USTAR_FORMAT) as tar:
    for name,item in sorted(files.items()):
        data=item.read_bytes(); info=tarfile.TarInfo(name.lstrip('/'));info.size=len(data);info.mode=0o555 if item.stat().st_mode&0o111 else 0o444
        info.uid=info.gid=0;info.mtime=0;tar.addfile(info,io.BytesIO(data))
    for name,data,mode in [('trial.py',cfg['worker'].encode(),0o444),('etc/nsswitch.conf',b'hosts: files dns\n',0o444)]:
        info=tarfile.TarInfo(name);info.size=len(data);info.mode=mode;info.uid=info.gid=0;info.mtime=0;tar.addfile(info,io.BytesIO(data))
os.chmod(archive,0o600)
print(json.dumps({'pythonPath':str(python),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'sourceFiles':len(files),'sitePackages':False}))
`;

// Numeric sockets and raw DNS only. -I -S prevents site customizations. The image
// has no host mounts, capabilities, package manager or application/ERP code.
const WORKER = String.raw`
import ctypes, errno, ipaddress, json, os, select, socket, struct, sys
mode,nonce=sys.argv[1:3]
if os.geteuid()==0:
    os.setgroups([]);os.setgid(65534);os.setuid(65534)
    if ctypes.CDLL(None).prctl(38,1,0,0,0)!=0:raise RuntimeError('cannot restrict local probe')
if os.geteuid()!=65534 or os.getegid()!=65534:raise RuntimeError('unexpected probe UID')
with open('/proc/self/status') as stream: status=dict(line.split(':',1) for line in stream if ':' in line)
if any(int(status[key].strip(),16)!=0 for key in ['CapEff','CapPrm','CapAmb','CapInh']) or status['NoNewPrivs'].strip()!='1':raise RuntimeError('unexpected probe privileges')
def exact(conn,n):
    data=b''
    while len(data)<n:
        part=conn.recv(n-len(data))
        if not part: raise OSError('short read')
        data+=part
    return data
if mode=='serve':
    listeners=[]
    for address,family in [('0.0.0.0',socket.AF_INET),('::1',socket.AF_INET6)]:
        for port in [5432,8000,5000]:
            s=socket.socket(family,socket.SOCK_STREAM);s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            if family==socket.AF_INET6:s.setsockopt(socket.IPPROTO_IPV6,socket.IPV6_V6ONLY,1)
            s.bind((address,port));s.listen(8);listeners.append(s)
    while True:
        for server in select.select(listeners,[],[],1)[0]:
            conn,_=server.accept()
            with conn:
                conn.settimeout(1)
                try:
                    if conn.recv(256)==nonce.encode():conn.sendall(nonce.encode())
                except OSError:pass
else:
    address,port=sys.argv[3],int(sys.argv[4]);ipaddress.ip_address(address)
    result={'connected':False,'received':False,'ok':False,'answers':[],'rcode':None,'errno':None}
    try:
        if mode=='tcp':
            with socket.create_connection((address,port),timeout=1) as conn:
                result['connected']=True;conn.sendall(nonce.encode());reply=conn.recv(256)
                result['received']=True;result['ok']=reply==nonce.encode()
        else:
            name=sys.argv[5]; question=b''.join(bytes([len(p)])+p.encode() for p in name.split('.'))+b'\0\0\1\0\1'
            packet=struct.pack('!HHHHHH',360,256,1,0,0,0)+question
            if mode=='dns-udp':
                with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as conn:
                    conn.settimeout(1);conn.sendto(packet,(address,port));answer=conn.recv(4096)
            elif mode=='dns-tcp':
                with socket.create_connection((address,port),timeout=1) as conn:
                    result['connected']=True;conn.sendall(struct.pack('!H',len(packet))+packet);answer=exact(conn,struct.unpack('!H',exact(conn,2))[0])
            else:raise ValueError('unsupported local probe')
            result['received']=True
            if len(answer)<12 or answer[:2]!=packet[:2]:raise ValueError('invalid local DNS reply')
            result['rcode']=answer[3]&15;offset=12
            def skip(data,i):
                while True:
                    n=data[i];i+=1
                    if n==0:return i
                    if n&192==192:return i+1
                    if n&192:raise ValueError('DNS label')
                    i+=n
            for _ in range(struct.unpack_from('!H',answer,4)[0]):offset=skip(answer,offset)+4
            for _ in range(struct.unpack_from('!H',answer,6)[0]):
                offset=skip(answer,offset);kind,cls,ttl,size=struct.unpack_from('!HHIH',answer,offset);offset+=10
                if kind==1 and cls==1 and size==4:result['answers'].append(socket.inet_ntoa(answer[offset:offset+4]))
                offset+=size
            result['ok']=result['rcode']==0 and bool(result['answers'])
    except OSError as error:result['errno']='TIMEOUT' if isinstance(error,TimeoutError) else error.errno
    except (ValueError,IndexError,struct.error):result['errno']='INVALID_DNS'
    print(json.dumps(result))
`;

export function prepareTrialPayload({ directory, nonce, pythonPath = '/usr/bin/python3' }, options = {}) {
  need(UUID.test(nonce ?? ''), 'INVALID_TRIAL_PAYLOAD_NONCE'); const drivers = io(options);
  need(drivers.fs.uid() === 0, 'TRIAL_PAYLOAD_REQUIRES_ROOT'); privateDirectory(drivers.fs, directory); path(pythonPath);
  const executable = drivers.fs.realpathSync(pythonPath), binary = drivers.fs.lstatSync(executable);
  need(binary.isFile() && binary.uid === 0 && (binary.mode & 0o022) === 0, 'UNTRUSTED_TRIAL_PYTHON');
  const archivePath = directory + '/python-probe.tar';
  let absent = false;
  try { drivers.fs.lstatSync(archivePath); } catch (error) { if (error.code === 'ENOENT') absent = true; else throw error; }
  need(absent, 'TRIAL_PAYLOAD_ARCHIVE_ALREADY_EXISTS');
  try {
    const raw = drivers.execute(executable, ['-I', '-S', '-B', '-c', ASSEMBLE, JSON.stringify({ archive: archivePath, worker: WORKER })], {
    encoding: 'utf8', cwd: '/', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' }, shell: false, timeout: 90_000, maxBuffer: 4096,
  });
  const report = JSON.parse(raw); keys(report, ['pythonPath', 'sha256', 'sourceFiles', 'sitePackages'], 'INVALID_TRIAL_PAYLOAD_REPORT');
  need(HEX.test(report.sha256) && report.pythonPath === executable && Number.isSafeInteger(report.sourceFiles) && report.sourceFiles > 0 && report.sitePackages === false, 'TRIAL_PAYLOAD_SOURCE_UNPROVEN');
  const state = { ...drivers, archivePath, nonce, pythonPath: executable, sha256: report.sha256, sourceFiles: report.sourceFiles,
    archiveInode: drivers.fs.lstatSync(archivePath).ino, phase: 'prepared' };
  need(hash(archiveBytes(state)) === state.sha256, 'TRIAL_PAYLOAD_ARCHIVE_CHANGED');
    const cap = Object.freeze({ kind: 'TRIAL_LOCAL_PYTHON_PAYLOAD', replay_authorized: false }); payloads.set(cap, state); return cap;
  } catch {
    let pending = null;
    try {
      const row = drivers.fs.lstatSync(archivePath);
      pending = { path: archivePath, inode: row.ino, ownershipUnproven: !row.isFile() || row.isSymbolicLink() || row.uid !== 0 };
    } catch (error) { if (error.code !== 'ENOENT') pending = { path: archivePath, inode: null, ownershipUnproven: true }; }
    const error = new Error('TRIAL_PAYLOAD_PREPARATION_FAILED'); error.code = 'TRIAL_PAYLOAD_PREPARATION_FAILED'; error.pending_resources = { archive: pending };
    throw error;
  }
}
export function describeTrialPayload(cap) {
  const state = payloads.get(cap); need(state && state.phase === 'prepared', 'UNMINTED_OR_CLOSED_TRIAL_PAYLOAD');
  need(hash(archiveBytes(state)) === state.sha256, 'TRIAL_PAYLOAD_ARCHIVE_CHANGED');
  return { archivePath: state.archivePath, sha256: state.sha256, sourceFiles: state.sourceFiles, pythonPath: state.pythonPath,
    origin: 'runner-local Python stdlib and dependencies; no registry', replay_authorized: false };
}
export function cleanupTrialPayload(cap) {
  const state = payloads.get(cap); need(state && state.phase === 'prepared', 'UNMINTED_OR_CLOSED_TRIAL_PAYLOAD');
  state.phase = 'cleaning';
  try {
    need(hash(archiveBytes(state)) === state.sha256, 'TRIAL_PAYLOAD_ARCHIVE_CHANGED'); state.fs.unlinkSync(state.archivePath);
    let absent = false;
    try { state.fs.lstatSync(state.archivePath); } catch (error) { if (error.code === 'ENOENT') absent = true; else throw error; }
    need(absent, 'TRIAL_PAYLOAD_ARCHIVE_REMAINS'); state.phase = 'closed';
    return { status: 'TRIAL_PAYLOAD_CLEANED', cleanup_verified: true, full_cleanup_verified: false, replay_authorized: false };
  } catch { state.phase = 'failed'; need(false, 'TRIAL_PAYLOAD_CLEANUP_UNPROVEN'); }
}

function one(value) { need(Array.isArray(value) && value.length === 1, 'TRIAL_DOCKER_INSPECT_UNPROVEN'); return value[0]; }
function probeResult(raw) {
  const value = JSON.parse(raw); keys(value, ['connected', 'received', 'ok', 'answers', 'rcode', 'errno'], 'TRIAL_PROBE_OUTPUT_UNMODELED');
  need(['connected', 'received', 'ok'].every(key => typeof value[key] === 'boolean') && Array.isArray(value.answers) &&
    value.answers.every(ip => /^198\.19\.36\.\d+$/.test(ip)) && (value.rcode === null || Number.isSafeInteger(value.rcode) && value.rcode >= 0 && value.rcode <= 15) &&
    (value.errno === null || ['TIMEOUT', 'INVALID_DNS'].includes(value.errno) || Number.isSafeInteger(value.errno)), 'TRIAL_PROBE_OUTPUT_UNMODELED'); return value;
}
function unreachable(result) { return ['TIMEOUT', 101, 110, 111, 113].includes(result.errno); }

// Bounded topology for this trial only. Unknown interface/route syntax blocks;
// this is not a general network-policy parser or a replay authorization.
export function verifyTrialOuterTopology({ observation, networkId }) {
  need(HEX.test(networkId ?? ''), 'TRIAL_TOPOLOGY_NETWORK_UNPROVEN');
  keys(observation, ['links', 'addresses', 'ipv4Routes', 'ipv6Routes'], 'TRIAL_TOPOLOGY_OBSERVATION_UNMODELED');
  need(Object.values(observation).every(Array.isArray), 'TRIAL_TOPOLOGY_OBSERVATION_UNMODELED');
  const bridge = 'br-' + networkId.slice(0, 12), links = observation.links;
  need(links.length === 5 && new Set(links.map(row => row?.ifname)).size === 5 && new Set(links.map(row => row?.ifindex)).size === 5,
    'TRIAL_TOPOLOGY_LINK_COUNT_CHANGED');
  const byName = new Map(links.map(row => [row.ifname, row]));
  for (const row of links) {
    need(Number.isSafeInteger(row.ifindex) && row.ifindex > 0 && Array.isArray(row.flags), 'TRIAL_TOPOLOGY_LINK_UNMODELED');
    if (row.ifname === 'lo') need(row.link_type === 'loopback' && row.flags.includes('LOOPBACK') && row.flags.includes('UP'), 'TRIAL_TOPOLOGY_LOOPBACK_UNPROVEN');
    else if (['docker0', bridge].includes(row.ifname)) need(row.linkinfo?.info_kind === 'bridge' && row.master === undefined, 'TRIAL_TOPOLOGY_BRIDGE_UNPROVEN');
    else need(/^veth[a-f0-9]+$/.test(row.ifname ?? '') && row.linkinfo?.info_kind === 'veth' &&
      (row.master === bridge || row.master === byName.get(bridge)?.ifindex), 'TRIAL_TOPOLOGY_UPLINK_OR_UNOWNED_VETH');
  }
  need(['lo', 'docker0', bridge].every(name => byName.has(name)), 'TRIAL_TOPOLOGY_REQUIRED_LINK_OMITTED');
  const prefixes = { docker0: '172.30.36', [bridge]: '198.19.36' }, observedAddresses = new Map();
  const linkLocal = address => typeof address === 'string' && address.startsWith('fe80::') && isIP(address) === 6;
  need(observation.addresses.length === links.length && new Set(observation.addresses.map(row => row?.ifname)).size === links.length,
    'TRIAL_TOPOLOGY_ADDRESS_LINK_OMITTED');
  for (const row of observation.addresses) {
    const link = byName.get(row.ifname); need(link && row.ifindex === link.ifindex && Array.isArray(row.addr_info), 'TRIAL_TOPOLOGY_ADDRESS_LINK_CHANGED');
    const addresses = [];
    for (const address of row.addr_info) {
      need(!Object.hasOwn(address, 'peer'), 'TRIAL_TOPOLOGY_PEER_ADDRESS_UNMODELED');
      if (address.family === 'inet') {
        const expected = row.ifname === 'lo' ? '127.0.0.1' : prefixes[row.ifname] && prefixes[row.ifname] + '.1';
        need(address.local === expected && address.prefixlen === (row.ifname === 'lo' ? 8 : 24) &&
          address.scope === (row.ifname === 'lo' ? 'host' : 'global'), 'TRIAL_TOPOLOGY_EXTERNAL_IPV4_ADDRESS');
      } else need(address.family === 'inet6' && (row.ifname === 'lo' ? address.local === '::1' && address.prefixlen === 128 && address.scope === 'host' :
        linkLocal(address.local) && address.prefixlen === 64 && address.scope === 'link'), 'TRIAL_TOPOLOGY_EXTERNAL_IPV6_ADDRESS');
      addresses.push(address.local);
    }
    if (row.ifname === 'lo') need(addresses.includes('127.0.0.1') && addresses.includes('::1'), 'TRIAL_TOPOLOGY_LOOPBACK_ADDRESS_OMITTED');
    if (prefixes[row.ifname]) need(addresses.includes(prefixes[row.ifname] + '.1'), 'TRIAL_TOPOLOGY_BRIDGE_ADDRESS_OMITTED');
    observedAddresses.set(row.ifname, addresses);
  }
  const allowedRouteFields = new Set(['type', 'dst', 'dev', 'table', 'protocol', 'scope', 'prefsrc', 'src', 'metric', 'pref', 'flags', 'cache', 'expires']);
  for (const [family, rows] of [[4, observation.ipv4Routes], [6, observation.ipv6Routes]]) for (const row of rows) {
    need(row && typeof row === 'object' && Object.keys(row).every(name => allowedRouteFields.has(name)) && byName.has(row.dev) &&
      row.dst !== 'default' && !['0.0.0.0/0', '::/0'].includes(row.dst) && (row.type === undefined || ['unicast', 'local', 'broadcast', 'multicast'].includes(row.type)) &&
      (row.protocol === undefined || row.protocol === 'kernel') && (row.scope === undefined || ['host', 'link', 'global'].includes(row.scope)) &&
      (row.table === undefined || ['main', 'local', 254, 255].includes(row.table)) && (row.flags === undefined || Array.isArray(row.flags)),
    'TRIAL_TOPOLOGY_UPLINK_OR_UNMODELED_ROUTE');
    const split = typeof row.dst === 'string' ? row.dst.split('/') : [], address = split[0], prefix = split[1];
    need(split.length > 0 && split.length <= 2 && isIP(address) === family, 'TRIAL_TOPOLOGY_ROUTE_DESTINATION_UNMODELED');
    if (family === 4) {
      const block = row.dev === 'lo' ? '127' : prefixes[row.dev];
      if (row.dev === 'lo') need(address.startsWith('127.') && (prefix === undefined || [8, 32].includes(Number(prefix))), 'TRIAL_TOPOLOGY_EXTERNAL_IPV4_ROUTE');
      else need(block && (row.dst === block + '.0/24' || [block + '.0', block + '.1', block + '.255'].includes(address) &&
        (prefix === undefined || prefix === '32')), 'TRIAL_TOPOLOGY_EXTERNAL_IPV4_ROUTE');
    } else need(row.dev === 'lo' && address === '::1' && (prefix === undefined || prefix === '128') ||
      row.dst === 'ff00::/8' || linkLocal(address) && (prefix === '64' && address === 'fe80::' ||
        (prefix === undefined || prefix === '128') && observedAddresses.get(row.dev).includes(address)), 'TRIAL_TOPOLOGY_EXTERNAL_IPV6_ROUTE');
    for (const field of ['prefsrc', 'src']) if (row[field] !== undefined)
      need(observedAddresses.get(row.dev).includes(row[field]), 'TRIAL_TOPOLOGY_ROUTE_SOURCE_CHANGED');
  }
  for (const [name, block] of Object.entries(prefixes)) need(observation.ipv4Routes.some(row => row.dev === name && row.dst === block + '.0/24'),
    'TRIAL_TOPOLOGY_CONNECTED_ROUTE_OMITTED');
  return { status: 'OWNED_TOPOLOGY_VALID', networkId, interfaces: [...byName.keys()].sort() };
}
function canarySnapshot(canaries, binding) {
  const snapshot = canaries.snapshot();
  need(JSON.stringify(validateBinding(snapshot?.binding)) === JSON.stringify(binding), 'TRIAL_CANARY_BINDING_CHANGED');
  need(snapshot && snapshot.identity?.nonce === binding.nonce && Number.isSafeInteger(snapshot.identity.namespaceInode) &&
    Number.isSafeInteger(snapshot.identity.pid) && /^[1-9][0-9]*$/.test(snapshot.identity.startTicks ?? '') &&
    snapshot.receipts && Object.values(snapshot.receipts).every(n => Number.isSafeInteger(n) && n >= 0), 'TRIAL_CANARY_SNAPSHOT_UNPROVEN');
  keys(snapshot.endpoints, ROLES, 'TRIAL_CANARY_ROLE_OMITTED'); keys(snapshot.receipts, ROLES, 'TRIAL_CANARY_ROLE_OMITTED');
  keys(snapshot.unexpectedReceipts, ROLES, 'TRIAL_CANARY_UNEXPECTED_COUNTS_OMITTED');
  need(Object.values(snapshot.unexpectedReceipts).every(n => n === 0), 'TRIAL_CANARY_UNEXPECTED_TRAFFIC');
  for (const role of ROLES) {
    const endpoint = snapshot.endpoints[role], dns = role.startsWith('dns');
    const address = role === 'ipv6' ? '::1' : role === 'ipv6Benchmark' ? 'fd00:360::1' : role.startsWith('dnsNonLoop') ? '198.18.0.1' : '127.254.36.1';
    need(endpoint?.role === role && endpoint.address === address && endpoint.family === (address.includes(':') ? 6 : 4) &&
      endpoint.protocol === (role.endsWith('Udp') ? 'udp' : 'tcp') && (!dns || endpoint.port === 53), 'TRIAL_CANARY_ENDPOINT_CHANGED');
  }
  return snapshot;
}

export async function runPrivateDockerTrialProbes({ pin, dockerHost, clientDirectory, dockerPath, dataRoot, payload, binding, canaries, resolver, signal, deadlineAtMs, cancelled }, options = {}) {
  const context = validateBinding(binding), drivers = io(options), local = payloads.get(payload);
  need(local && local.phase === 'prepared' && local.nonce === context.nonce, 'UNMINTED_OR_FOREIGN_TRIAL_PAYLOAD');
  need(local.fixture === drivers.fixture, 'PAIR_PAYLOAD_AND_PROBE_DRIVERS');
  const fixture = drivers.fixture || local.fixture;
  const workDeadline = deadlineAtMs ?? drivers.now() + 240_000;
  need(Number.isSafeInteger(workDeadline) && workDeadline > drivers.now() && workDeadline <= drivers.now() + 240_000 &&
    (cancelled === undefined || typeof cancelled === 'function'), 'TRIAL_PROBE_BUDGET_UNMODELED');
  path(clientDirectory); path(dockerPath); path(dataRoot);
  need(typeof dockerHost === 'string' && dockerHost.startsWith('unix://'), 'TRIAL_PRIVATE_DOCKER_ENDPOINT_REQUIRED');
  path(dockerHost.slice(7));
  need(dockerHost === 'unix://' + posix.dirname(dataRoot) + '/docker.sock' && clientDirectory === posix.dirname(dataRoot) + '/client', 'TRIAL_PRIVATE_DOCKER_ENDPOINT_REQUIRED');
  privateDirectory(drivers.fs, posix.dirname(dataRoot));
  need(canaries && typeof canaries.snapshot === 'function' && typeof canaries.positive === 'function', 'TRIAL_CANARIES_REQUIRED');
  need(resolver?.daemonAddress === '127.254.36.1' && resolver?.sandboxAddress === '198.18.0.1' && resolver?.configuredBeforeDaemon === true, 'TRIAL_DNS_PRESTART_CONFIG_REQUIRED');
  const descriptor = describeTrialPayload(payload), prefix = 'lg360v2_' + hash(JSON.stringify(context)).slice(0, 12);
  const labelKey = 'io.liftgo.trial2.binding', labelValue = hash(JSON.stringify(context)), resources = { containers: [], network: null, image: null };
  const checkpoint = () => { need(!signal?.aborted && !cancelled?.(), 'TRIAL_PROBES_CANCELLED'); need(drivers.now() < workDeadline, 'TRIAL_PROBE_WORK_DEADLINE'); };
  const docker = args => { checkpoint(); const output = drivers.run(pin, dockerPath, ['--config', clientDirectory, '--host', dockerHost, ...args]); checkpoint(); return output; };
  let cleanupDeadline;
  const cleanupDocker = args => { need(drivers.now() < cleanupDeadline, 'TRIAL_PROBE_CLEANUP_DEADLINE'); return drivers.run(pin, dockerPath, ['--config', clientDirectory, '--host', dockerHost, ...args]); };
  const inspect = (kind, id) => one(JSON.parse(docker([kind, 'inspect', id])));
  const measurements = [], checks = {}, controls = [], topology = {};
  let failed = false, cleanupFailed = false, failureCode = null;
  try {
    resources.image = docker(['image', 'import', '--change', 'USER 65534:65534', '--change', `LABEL ${labelKey}=${labelValue}`, descriptor.archivePath, prefix + ':local']).trim();
    need(/^sha256:[a-f0-9]{64}$/.test(resources.image), 'TRIAL_IMAGE_ID_UNPROVEN');
    const image = inspect('image', resources.image);
    need(image.Id === resources.image && image.Architecture === 'amd64' && image.Os === 'linux' && image.RootFS?.Type === 'layers' && image.RootFS.Layers?.length === 1 &&
      /^sha256:[a-f0-9]{64}$/.test(image.RootFS.Layers[0]) && image.Config?.User === '65534:65534' && image.Config?.Labels?.[labelKey] === labelValue, 'TRIAL_IMAGE_OWNERSHIP_UNPROVEN');
    resources.network = docker(['network', 'create', '--driver', 'bridge', '--subnet', '198.19.36.0/24', '--gateway', '198.19.36.1', '--label', `${labelKey}=${labelValue}`, prefix]).trim();
    need(HEX.test(resources.network), 'TRIAL_NETWORK_ID_UNPROVEN');
    const network = inspect('network', resources.network);
    need(network.Id === resources.network && network.Driver === 'bridge' && network.Internal === false && network.Labels?.[labelKey] === labelValue &&
      network.IPAM?.Config?.length === 1 && network.IPAM.Config[0].Subnet === '198.19.36.0/24' && network.IPAM.Config[0].Gateway === '198.19.36.1', 'TRIAL_NORMAL_BRIDGE_UNPROVEN');
    const contexts = [];
    for (const [index, suffix] of ['a', 'b'].entries()) {
      const name = prefix + '_' + suffix, basePort = 25432 + index * 10;
      const args = ['container', 'create', '--pull', 'never', '--name', name, '--label', `${labelKey}=${labelValue}`, '--network', prefix, '--network-alias', name,
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534', '--pids-limit', '32', '--memory', '64m',
        '--sysctl', 'net.ipv6.conf.all.disable_ipv6=0', '--sysctl', 'net.ipv6.conf.lo.disable_ipv6=0',
        '-p', `127.0.0.1:${basePort}:5432`, '-p', `127.0.0.1:${basePort + 1}:8000`, '-p', `127.0.0.1:${basePort + 2}:5000`];
      if (index === 1) args.push('--dns', '198.18.0.1');
      args.push('--entrypoint', descriptor.pythonPath, resources.image, '-I', '-S', '-B', '/trial.py', 'serve', context.nonce);
      const id = docker(args).trim(); need(HEX.test(id), 'TRIAL_CONTAINER_ID_UNPROVEN'); resources.containers.push(id);
      docker(['container', 'start', id]); const row = inspect('container', id);
      need(row.Id === id && row.Image === resources.image && row.Config?.Labels?.[labelKey] === labelValue && row.Config?.User === '65534:65534' &&
        row.HostConfig?.ReadonlyRootfs === true && JSON.stringify(row.HostConfig?.CapDrop) === '["ALL"]' &&
        row.HostConfig?.Privileged === false && row.HostConfig?.NetworkMode === prefix && Object.keys(row.NetworkSettings?.Networks ?? {}).join() === prefix &&
        row.Config?.Entrypoint?.join() === descriptor.pythonPath && row.State?.Running === true, 'TRIAL_CONTAINER_OWNERSHIP_UNPROVEN');
      const resolvPath = `${dataRoot}/containers/${id}/resolv.conf`;
      need(row.ResolvConfPath === resolvPath && drivers.fs.realpathSync(resolvPath) === resolvPath, 'TRIAL_RESOLVER_PATH_UNPROVEN');
      const file = drivers.fs.lstatSync(resolvPath); need(file.isFile() && !file.isSymbolicLink() && file.uid === 0, 'TRIAL_RESOLVER_FILE_UNPROVEN');
      const text = drivers.fs.readFileSync(resolvPath, 'utf8'), lines = text.split('\n');
      need(lines.filter(line => /^nameserver\s/.test(line)).join() === 'nameserver 127.0.0.11' && lines.filter(line => line.startsWith('# ExtServers:')).length === 1 &&
        lines.filter(line => line.startsWith('# Overrides:')).length === 1 && lines.includes(index === 0 ? '# ExtServers: [host(127.254.36.1)]' : '# ExtServers: [198.18.0.1]') &&
        lines.includes(index === 0 ? '# Overrides: []' : '# Overrides: [nameservers]'), 'TRIAL_DOCKER_DNS_ROUTE_UNPROVEN');
      const ip = row.NetworkSettings.Networks[prefix].IPAddress; need(/^198\.19\.36\.[2-9][0-9]?$/.test(ip), 'TRIAL_CONTAINER_IP_UNPROVEN');
      contexts.push({ id, alias: name, ip, basePort, route: index === 0 ? 'daemon-host' : 'sandbox-override' });
    }
    const observeTopology = () => {
      const collect = args => { checkpoint(); const value = JSON.parse(drivers.run(pin, '/usr/sbin/ip', args)); checkpoint(); return value; };
      const observation = { links: collect(['-d', '-j', 'link', 'show']), addresses: collect(['-j', 'addr', 'show']),
        ipv4Routes: collect(['-4', '-j', 'route', 'show', 'table', 'all']), ipv6Routes: collect(['-6', '-j', 'route', 'show', 'table', 'all']) };
      verifyTrialOuterTopology({ observation, networkId: resources.network }); return observation;
    };
    topology.before = observeTopology();
    const probe = (ctx, mode, address, port, name = '') => probeResult(docker(['container', 'exec', ctx.id, descriptor.pythonPath, '-I', '-S', '-B', '/trial.py', mode, context.nonce, address, String(port), name]));
    for (const [index, ctx] of contexts.entries()) {
      const peer = contexts[1 - index];
      for (const mode of ['dns-udp', 'dns-tcp']) { const result = probe(ctx, mode, '127.0.0.11', 53, peer.alias); need(result.ok && result.answers.includes(peer.ip), 'TRIAL_DOCKER_DNS_ALIAS_POSITIVE_FAILED'); }
      need(probe(ctx, 'tcp', peer.ip, 5432).ok && probe(ctx, 'tcp', '::1', 5432).ok, 'TRIAL_PEER_OR_IPV6_POSITIVE_FAILED');
      for (let offset = 0; offset < 3; offset++) {
        checkpoint();
        const raw = drivers.run(pin, local.pythonPath, ['-I', '-S', '-B', '-c', WORKER, 'tcp', context.nonce, '127.0.0.1', String(ctx.basePort + offset)]);
        checkpoint();
        need(probeResult(raw).ok, 'TRIAL_PUBLISHED_PORT_POSITIVE_FAILED');
      }
      const positive = await canaries.positive(); need(positive?.status === 'LOCAL_CANARIES_POSITIVE' && positive.identity?.nonce === context.nonce && Array.isArray(positive.roles) &&
        [...positive.roles].sort().join() === [...ROLES].sort().join(), 'TRIAL_EXTERNAL_POSITIVE_FAILED');
      need(JSON.stringify(validateBinding(positive.binding)) === JSON.stringify(context), 'TRIAL_CANARY_BINDING_CHANGED');
      const before = canarySnapshot(canaries, context);
      need(JSON.stringify(positive.identity) === JSON.stringify(before.identity), 'TRIAL_CANARY_IDENTITY_CHANGED');
      for (const role of ROLES) {
        const endpoint = before.endpoints[role];
        need(endpoint.role === role && ['tcp', 'udp'].includes(endpoint.protocol) && Number.isSafeInteger(endpoint.port) && endpoint.port > 0 && endpoint.port <= 65535 &&
          ['127.254.36.1', '::1', '198.18.0.1', 'fd00:360::1'].includes(endpoint.address), 'TRIAL_LOCAL_CANARY_ENDPOINT_UNPROVEN');
        const mode = role.startsWith('dns') ? (endpoint.protocol === 'udp' ? 'dns-udp' : 'dns-tcp') : 'tcp';
        const result = probe(ctx, mode, endpoint.address, endpoint.port, 'lg360-' + context.nonce + '.invalid');
        need(!result.connected && !result.received && !result.ok && unreachable(result), 'TRIAL_DIRECT_HOST_CANARY_REACHABLE_OR_UNPROVEN');
        measurements.push({ route: ctx.route, kind: 'direct-' + role, result });
      }
      for (const mode of ['dns-udp', 'dns-tcp']) {
        const result = probe(ctx, mode, '127.0.0.11', 53, 'lg360-' + context.nonce + '.invalid');
        need(!result.ok && result.answers.length === 0 && (result.received && [2, 3].includes(result.rcode) && result.errno === null ||
          !result.received && result.rcode === null && unreachable(result)), 'TRIAL_DNS_UPSTREAM_NOT_BLOCKED');
        measurements.push({ route: ctx.route, kind: mode + '-upstream', result });
      }
      const after = canarySnapshot(canaries, context);
      need(JSON.stringify(before.identity) === JSON.stringify(after.identity) && JSON.stringify(before.receipts) === JSON.stringify(after.receipts), 'TRIAL_OUTSIDE_CANARY_RECEIVED_OR_CHANGED');
      for (const mode of ['dns-udp', 'dns-tcp']) {
        const result = probe(ctx, mode, '127.0.0.11', 53, peer.alias);
        need(result.ok && result.answers.includes(peer.ip), 'TRIAL_DOCKER_DNS_ALIAS_POSITIVE_AFTER_FAILED');
      }
      const positiveAfter = await canaries.positive();
      need(positiveAfter?.status === 'LOCAL_CANARIES_POSITIVE' && JSON.stringify(positiveAfter.identity) === JSON.stringify(before.identity) && Array.isArray(positiveAfter.roles) &&
        [...positiveAfter.roles].sort().join() === [...ROLES].sort().join(), 'TRIAL_OUTSIDE_CANARY_NOT_ALIVE_AFTER');
      need(JSON.stringify(validateBinding(positiveAfter.binding)) === JSON.stringify(context), 'TRIAL_CANARY_BINDING_CHANGED');
      for (const measurement of measurements.filter(item => item.route === ctx.route)) controls.push({
        name: measurement.route + ':' + measurement.kind, route: ctx.route, positiveBefore: true, positiveAfter: true, blocked: true,
        receiptsBefore: { ...before.receipts }, receiptsAfter: { ...after.receipts }, probe: measurement.result,
      });
      checks[ctx.route] = true;
    }
    need(Object.keys(checks).length === 2, 'TRIAL_DNS_ROUTE_OMITTED');
    need(controls.map(control => control.name).join() === REQUIRED_TRIAL_PROBE_CONTROLS.join(), 'TRIAL_CONTROL_OMITTED_OR_REORDERED');
    topology.after = observeTopology();
  } catch (error) { failed = true; failureCode = /^TRIAL_[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'TRIAL_OPERATION_UNPROVEN'; }
  finally {
    cleanupDeadline = drivers.now() + 25_000;
    const cleanupInspect = (kind, id) => one(JSON.parse(cleanupDocker([kind, 'inspect', id])));
    for (const id of [...resources.containers].reverse()) { try { const row = cleanupInspect('container', id); need(row.Config?.Labels?.[labelKey] === labelValue, 'TRIAL_RESOURCE_OWNERSHIP_CHANGED'); cleanupDocker(['container', 'rm', '--force', id]); } catch { cleanupFailed = true; } }
    if (resources.network) { try { need(cleanupInspect('network', resources.network).Labels?.[labelKey] === labelValue, 'TRIAL_RESOURCE_OWNERSHIP_CHANGED'); cleanupDocker(['network', 'rm', resources.network]); } catch { cleanupFailed = true; } }
    if (resources.image) { try { need(cleanupInspect('image', resources.image).Config?.Labels?.[labelKey] === labelValue, 'TRIAL_RESOURCE_OWNERSHIP_CHANGED'); cleanupDocker(['image', 'rm', resources.image]); } catch { cleanupFailed = true; } }
    try {
      for (const id of resources.containers) need(cleanupDocker(['container', 'ls', '--all', '--no-trunc', '--filter', 'id=' + id, '--format', '{{.ID}}']).trim() === '', 'TRIAL_CONTAINER_REMAINS');
      if (resources.network) need(cleanupDocker(['network', 'ls', '--no-trunc', '--filter', 'id=' + resources.network, '--format', '{{.ID}}']).trim() === '', 'TRIAL_NETWORK_REMAINS');
      if (resources.image) need(!cleanupDocker(['image', 'ls', '--no-trunc', '--format', '{{.ID}}']).trim().split('\n').includes(resources.image), 'TRIAL_IMAGE_REMAINS');
    } catch { cleanupFailed = true; }
  }
  if (failed || cleanupFailed) {
    const error = new Error(cleanupFailed ? 'TRIAL_PROBE_CLEANUP_UNPROVEN' : 'TRIAL_PRIVATE_DOCKER_PROBE_FAILED'); error.code = error.message;
    error.failure_code = failureCode; error.pending_resources = { ...resources, expectedPrefix: prefix, cleanupUnproven: cleanupFailed,
      lostResponsePossible: failed }; throw error;
  }
  return { schema_version: 1, kind: fixture ? 'fixture' : 'infrastructure-probes', status: 'PROBES_OBSERVED', binding: context,
    measurements, controls, checks, resources, topology, payload: descriptor, cleanup_verified: true,
    sql_authorized: false, replay_authorized: false, full_cleanup_verified: false };
}
