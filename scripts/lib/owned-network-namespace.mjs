// Privileged namespace primitive. This is not an egress policy or replay grant.
// Only the reviewed supervisor may supply owners/commands; observations are not capabilities.
import { execFileSync } from 'node:child_process';
import { closeSync, fstatSync, openSync, readFileSync, statSync, statfsSync } from 'node:fs';
import { isIP } from 'node:net';
import { posix } from 'node:path';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';

const NSFS_MAGIC = 0x6e736673;
const O_CLOEXEC_LINUX = 0o2000000;
const SAFE_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1' });
const DEFAULT_KERNEL = Object.freeze({ closeSync, fstatSync, openSync, readFileSync, statSync, statfsSync });
const minted = new WeakSet();
const states = new WeakMap();

function requireThat(condition, code) {
  if (!condition) { const error = new Error(code); error.code = code; throw error; }
}
function keys(value, expected, code) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  requireThat(Object.keys(value).sort().join('\0') === [...expected].sort().join('\0'), code);
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function copyOwner(owner) {
  keys(owner, ['binding', 'anchor', 'hostNamespaceInode'], 'INVALID_NAMESPACE_OWNER');
  keys(owner.anchor, ['pid', 'startTicks', 'namespaceInode'], 'INVALID_NAMESPACE_ANCHOR');
  const binding = validateBinding(owner.binding), anchor = owner.anchor;
  requireThat(positive(anchor.pid) && typeof anchor.startTicks === 'string' && /^[1-9][0-9]*$/.test(anchor.startTicks) &&
    positive(anchor.namespaceInode) && positive(owner.hostNamespaceInode) && anchor.namespaceInode !== owner.hostNamespaceInode,
  'INVALID_NAMESPACE_ANCHOR');
  return Object.freeze({ binding: Object.freeze({ ...binding }), anchor: Object.freeze({ ...anchor }), hostNamespaceInode: owner.hostNamespaceInode });
}
function drivers(options) {
  keys(options, Object.keys(options), 'INVALID_NAMESPACE_DRIVER');
  requireThat(Object.keys(options).every(key => ['kernel', 'execute'].includes(key)), 'INVALID_NAMESPACE_DRIVER');
  const supplied = Object.hasOwn(options, 'kernel') || Object.hasOwn(options, 'execute');
  if (!supplied) return { kernel: DEFAULT_KERNEL, execute: execFileSync };
  requireThat(Object.hasOwn(options, 'kernel') && Object.hasOwn(options, 'execute'), 'PAIR_NAMESPACE_TEST_DRIVERS');
  keys(options.kernel, Object.keys(DEFAULT_KERNEL), 'INVALID_NAMESPACE_KERNEL');
  requireThat(Object.values(options.kernel).every(value => typeof value === 'function') && typeof options.execute === 'function', 'INVALID_NAMESPACE_DRIVER');
  return { kernel: options.kernel, execute: options.execute };
}
function processIdentity(state) {
  const { kernel, owner } = state, { pid, startTicks, namespaceInode } = owner.anchor;
  const stat = kernel.readFileSync(`/proc/${pid}/stat`, 'utf8');
  requireThat(typeof stat === 'string' && stat.startsWith(`${pid} (`), 'NAMESPACE_PROCESS_CHANGED');
  const closing = stat.lastIndexOf(') '), tail = stat.slice(closing + 2).trim().split(/\s+/);
  requireThat(closing >= 0 && tail.length >= 20 && ['R', 'S', 'D', 'T', 't', 'I', 'W', 'P', 'K'].includes(tail[0]) &&
    tail[19] === startTicks, 'NAMESPACE_PROCESS_CHANGED');
  const command = kernel.readFileSync(`/proc/${pid}/cmdline`);
  requireThat(Buffer.isBuffer(command) && command.length > 0 && command.at(-1) === 0, 'NAMESPACE_ANCHOR_COMMAND_CHANGED');
  const argv = command.toString('utf8').slice(0, -1).split('\0');
  requireThat(argv.length >= 3 && argv.at(-2) === '__bootstrap_anchor' && argv.at(-1) === owner.binding.nonce &&
    argv.filter(value => value === '__bootstrap_anchor').length === 1 && argv.filter(value => value === owner.binding.nonce).length === 1,
  'NAMESPACE_ANCHOR_COMMAND_CHANGED');
  requireThat(kernel.statSync(`/proc/${pid}/ns/net`).ino === namespaceInode, 'NAMESPACE_PROCESS_CHANGED');
  requireThat(kernel.statSync('/proc/self/ns/net').ino === owner.hostNamespaceInode && namespaceInode !== owner.hostNamespaceInode,
    'RUNNER_NAMESPACE_CHANGED');
}
function fdIdentity(state) {
  // Node has no fstatfs API. Resolve only our own numeric FD magic-link and
  // bracket statfs with fstat so PID namespace paths are never reopened here.
  requireThat(state.kernel.fstatSync(state.fd).ino === state.owner.anchor.namespaceInode &&
    state.kernel.statfsSync(`/proc/self/fd/${state.fd}`).type === NSFS_MAGIC &&
    state.kernel.fstatSync(state.fd).ino === state.owner.anchor.namespaceInode, 'NAMESPACE_FD_CHANGED');
}
function release(state) {
  if (state.closed) return;
  state.closed = true; // Revocation precedes cleanup, including failed cleanup.
  try {
    fdIdentity(state); // Never close a descriptor that was replaced by an unrelated one.
    state.kernel.closeSync(state.fd);
  } catch (error) { state.closeFailed = true; throw error; }
}
function revoke(state) { try { release(state); } catch { /* Ownership loss remains a failure, never a reusable capability. */ } }
function live(pin) {
  requireThat(pin !== null && typeof pin === 'object' && minted.has(pin), 'UNMINTED_NAMESPACE_CAPABILITY');
  const state = states.get(pin);
  requireThat(!state.closed && !state.busy, 'NAMESPACE_CAPABILITY_CLOSED_OR_BUSY');
  try { processIdentity(state); fdIdentity(state); } catch {
    revoke(state); requireThat(false, 'NAMESPACE_IDENTITY_UNPROVEN');
  }
  return state;
}

export function pinOwnedNetworkNamespace(owner, options = {}) {
  const state = { owner: copyOwner(owner), ...drivers(options), fd: null, closed: false, closeFailed: false, busy: false };
  requireThat(process.platform === 'linux', 'LINUX_NAMESPACE_REQUIRED');
  try {
    processIdentity(state);
    state.fd = state.kernel.openSync(`/proc/${state.owner.anchor.pid}/ns/net`, O_CLOEXEC_LINUX);
    requireThat(Number.isInteger(state.fd) && state.fd >= 0, 'INVALID_NAMESPACE_FD');
    fdIdentity(state);
    processIdentity(state); // Detect PID/namespace replacement during open.
  } catch {
    if (state.fd !== null) revoke(state);
    requireThat(false, 'NAMESPACE_PIN_FAILED');
  }
  const pin = Object.freeze({ kind: 'OWNED_NETWORK_NAMESPACE', runtime_authorized: false });
  minted.add(pin); states.set(pin, state); return pin;
}

export function runInPinnedNamespace(pin, executable, args) {
  requireThat(typeof executable === 'string' && executable.startsWith('/') && posix.normalize(executable) === executable &&
    !/[\0\r\n]/.test(executable) && Array.isArray(args) && args.every(value => typeof value === 'string' && !value.includes('\0')),
  'INVALID_NAMESPACE_COMMAND');
  const state = live(pin); state.busy = true;
  let output, commandError;
  try {
    // fd 3 exists in nsenter itself; no PID path is reopened by the child.
    output = state.execute('/usr/bin/nsenter', ['--net=/proc/self/fd/3', '--', executable, ...args], {
      encoding: 'utf8', cwd: '/', env: { ...SAFE_ENV }, shell: false,
      stdio: ['ignore', 'pipe', 'pipe', state.fd], timeout: 15_000, maxBuffer: 1024 * 1024,
    });
  } catch { commandError = true; }
  finally { state.busy = false; }
  try { processIdentity(state); fdIdentity(state); } catch {
    revoke(state); requireThat(false, 'NAMESPACE_IDENTITY_UNPROVEN');
  }
  // Do not forward stderr/stdout from a failed command: it may contain credentials.
  requireThat(!commandError, 'NAMESPACE_COMMAND_FAILED');
  requireThat(typeof output === 'string', 'INVALID_NAMESPACE_COMMAND_OUTPUT');
  return output;
}

function localDestination(value, family) {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length > 2 || isIP(parts[0]) !== family) return false;
  if (family === 6) return parts[0] === '::1' && (parts.length === 1 || parts[1] === '128');
  return parts[0].startsWith('127.') && (parts.length === 1 || /^(?:[89]|[12][0-9]|3[0-2])$/.test(parts[1]));
}
function localRoutes(rows, family) {
  requireThat(Array.isArray(rows), 'INVALID_NAMESPACE_ROUTES');
  const allowed = new Set(['type', 'dst', 'dev', 'table', 'protocol', 'scope', 'prefsrc', 'src', 'metric', 'pref', 'flags']);
  for (const row of rows) {
    requireThat(row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).every(key => allowed.has(key)) &&
      row.dev === 'lo' && localDestination(row.dst, family) &&
      (row.type === undefined || ['local', 'broadcast', 'unicast'].includes(row.type)) &&
      (row.table === undefined || ['local', 'main', 254, 255].includes(row.table)) &&
      ['prefsrc', 'src'].every(key => row[key] === undefined || localDestination(row[key], family)) &&
      (row.flags === undefined || Array.isArray(row.flags) && row.flags.every(flag => typeof flag === 'string')),
    'NAMESPACE_HAS_EXTERNAL_OR_UNMODELED_ROUTE');
  }
  return rows;
}

export function observeEmptyBoundary(pin) {
  const state = live(pin), startedAt = Date.now();
  let links, ipv4, ipv6;
  try {
    links = JSON.parse(runInPinnedNamespace(pin, '/usr/sbin/ip', ['-j', 'link', 'show']));
    ipv4 = JSON.parse(runInPinnedNamespace(pin, '/usr/sbin/ip', ['-4', '-j', 'route', 'show', 'table', 'all']));
    ipv6 = JSON.parse(runInPinnedNamespace(pin, '/usr/sbin/ip', ['-6', '-j', 'route', 'show', 'table', 'all']));
  } catch { requireThat(false, 'NAMESPACE_BOUNDARY_UNOBSERVED'); }
  requireThat(Array.isArray(links) && links.length === 1 && links[0]?.ifname === 'lo' && links[0].link_type === 'loopback' &&
    Array.isArray(links[0].flags) && links[0].flags.includes('LOOPBACK'), 'NAMESPACE_HAS_EXTERNAL_OR_UNMODELED_INTERFACE');
  localRoutes(ipv4, 4); localRoutes(ipv6, 6); live(pin);
  return { schema_version: 1, status: 'BOUNDARY_OBSERVED', runtime_authorized: false,
    binding: { ...state.owner.binding }, anchor: { ...state.owner.anchor }, hostNamespaceInode: state.owner.hostNamespaceInode,
    startedAt, observedAt: Date.now(), interfaces: ['lo'], ipv4Routes: ipv4, ipv6Routes: ipv6 };
}

export function closePinnedNamespace(pin) {
  requireThat(pin !== null && typeof pin === 'object' && minted.has(pin), 'UNMINTED_NAMESPACE_CAPABILITY');
  const state = states.get(pin);
  requireThat(!state.busy, 'NAMESPACE_CAPABILITY_CLOSED_OR_BUSY');
  if (!state.closed) {
    try { release(state); } catch { requireThat(false, 'NAMESPACE_CLOSE_UNPROVEN'); }
  }
  requireThat(!state.closeFailed, 'NAMESPACE_CLOSE_UNPROVEN');
  return { status: 'CLOSED', runtime_authorized: false };
}
