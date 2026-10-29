// Inert anchor lifecycle only. A boundary is not permission to run SQL or Docker.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';
import { pinOwnedNetworkNamespace, observeEmptyBoundary, closePinnedNamespace, runInPinnedNamespace } from './owned-network-namespace.mjs';

const ANCHOR = '__bootstrap_anchor';
const LIFETIME_MS = 12 * 60 * 1000;
const READY_MS = 10_000, STOP_MS = 20_000;
const SAFE_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', TZ: 'UTC' });
const minted = new WeakMap();
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function requireThat(value, code) { if (!value) fail(code); }
function bounded(promise, milliseconds, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => { const error = new Error(code); error.code = code; reject(error); }, milliseconds);
  })]).finally(() => clearTimeout(timer));
}

function processIdentity(pid) {
  const raw = readFileSync(`/proc/${pid}/stat`, 'utf8'), closing = raw.lastIndexOf(') ');
  requireThat(raw.startsWith(`${pid} (`) && closing >= 0, 'ANCHOR_IDENTITY_INVALID');
  const fields = raw.slice(closing + 2).trim().split(/\s+/);
  requireThat(['R', 'S', 'D', 'T', 't', 'I', 'W', 'P', 'K'].includes(fields[0]) && /^[1-9][0-9]*$/.test(fields[19] ?? ''), 'ANCHOR_NOT_ALIVE');
  const command = readFileSync(`/proc/${pid}/cmdline`);
  requireThat(command.at(-1) === 0, 'ANCHOR_COMMAND_INVALID');
  return { pid, ppid: Number(fields[1]), startTicks: fields[19], namespaceInode: statSync(`/proc/${pid}/ns/net`).ino,
    argv: command.toString('utf8').slice(0, -1).split('\0') };
}
function launchAnchor(binding) {
  const child = spawn('/usr/bin/unshare', ['--net', '--', process.execPath, fileURLToPath(import.meta.url), ANCHOR, binding.nonce], {
    cwd: '/', env: { ...SAFE_ENV }, shell: false, detached: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  // Handlers are attached immediately. Never relay child output or inherit secrets.
  const ready = new Promise((resolve, reject) => {
    child.once('message', message => resolve(message));
    child.once('error', () => reject(new Error('ANCHOR_LAUNCH_FAILED')));
    child.once('exit', () => reject(new Error('ANCHOR_EXITED_BEFORE_READY')));
  });
  const finished = new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: null, error: true }));
    child.once('exit', (code, signal) => resolve({ code, signal, error: false }));
  });
  // Install a rejection handler even if creation fails before it can await ready.
  ready.catch(() => {});
  return { pid: child.pid, ready, finished,
    stop: () => { requireThat(child.connected, 'ANCHOR_IPC_UNAVAILABLE'); child.send({ operation: 'stop', nonce: binding.nonce }); },
    disconnect: () => { if (child.connected) child.disconnect(); } };
}
const DEFAULTS = Object.freeze({ launch: launchAnchor, identity: processIdentity,
  hostInode: () => statSync('/proc/self/ns/net').ino, parentPid: () => process.pid,
  pin: pinOwnedNetworkNamespace, observe: observeEmptyBoundary, close: closePinnedNamespace,
  activateLoopback: pin => {
    runInPinnedNamespace(pin, '/usr/sbin/ip', ['link', 'set', 'dev', 'lo', 'up']);
    const rows = JSON.parse(runInPinnedNamespace(pin, '/usr/sbin/ip', ['-j', 'link', 'show']));
    requireThat(Array.isArray(rows) && rows.length === 1 && rows[0]?.ifname === 'lo' && rows[0].link_type === 'loopback' &&
      Array.isArray(rows[0].flags) && rows[0].flags.includes('LOOPBACK') && rows[0].flags.includes('UP'), 'LOOPBACK_UP_UNPROVEN');
    return { status: 'LOOPBACK_UP', interfaces: ['lo'] };
  } });
function adapters(options) {
  requireThat(options && typeof options === 'object' && !Array.isArray(options), 'INVALID_OUTER_DRIVERS');
  if (Object.keys(options).length === 0) return { ports: DEFAULTS, test: false };
  requireThat(Object.keys(options).join() === 'testDrivers', 'PAIR_ALL_OUTER_TEST_DRIVERS');
  const ports = options.testDrivers;
  requireThat(ports && typeof ports === 'object' && Object.keys(ports).sort().join() === Object.keys(DEFAULTS).sort().join()
    && Object.values(ports).every(value => typeof value === 'function'), 'PAIR_ALL_OUTER_TEST_DRIVERS');
  return { ports, test: true };
}
function checkIdentity(state) {
  const now = state.ports.identity(state.child.pid), expected = state.owner.anchor;
  requireThat(now.pid === expected.pid && now.ppid === state.ports.parentPid() && now.startTicks === expected.startTicks &&
    now.namespaceInode === expected.namespaceInode && state.ports.hostInode() === state.owner.hostNamespaceInode &&
    now.namespaceInode !== state.owner.hostNamespaceInode && now.argv.at(-2) === ANCHOR && now.argv.at(-1) === state.binding.nonce,
  'OUTER_ANCHOR_CHANGED');
}
function live(capability) {
  const state = minted.get(capability);
  requireThat(state && state.phase === 'ready', 'OUTER_SESSION_NOT_LIVE');
  try { checkIdentity(state); } catch { state.phase = 'failed'; fail('OUTER_ANCHOR_CHANGED'); }
  return state;
}

/** Real default creates only an empty network namespace and an inert Node anchor. */
export async function createOuterNetworkSession({ binding }, options = {}) {
  const normalized = validateBinding(binding), { ports, test } = adapters(options), host = ports.hostInode();
  requireThat(Number.isSafeInteger(host) && host > 0, 'INVALID_HOST_NAMESPACE');
  const child = ports.launch(normalized);
  let pin;
  try {
    requireThat(Number.isSafeInteger(child.pid) && child.pid > 0, 'ANCHOR_LAUNCH_FAILED');
    const message = await bounded(child.ready, READY_MS, 'ANCHOR_READY_TIMEOUT');
    assert.deepEqual(message, { event: 'ready', pid: child.pid, nonce: normalized.nonce, lifetimeMs: LIFETIME_MS }, 'Foreign anchor handshake');
    const identity = ports.identity(child.pid);
    const owner = { binding: normalized, anchor: { pid: identity.pid, startTicks: identity.startTicks, namespaceInode: identity.namespaceInode }, hostNamespaceInode: host };
    const state = { binding: normalized, owner, child, ports, phase: 'ready', pin: null, cleanupError: false, test };
    checkIdentity(state); pin = ports.pin(owner); state.pin = pin;
    state.initialBoundary = ports.observe(pin); checkIdentity(state);
    requireThat(state.initialBoundary?.status === 'BOUNDARY_OBSERVED' && state.initialBoundary.runtime_authorized === false, 'EMPTY_BOUNDARY_UNPROVEN');
    state.loopback = ports.activateLoopback(pin);
    assert.deepEqual(state.loopback, { status: 'LOOPBACK_UP', interfaces: ['lo'] }, 'Loopback was not positively observed');
    ports.observe(pin); checkIdentity(state); // Bringing lo up may not introduce any other link/route.
    const capability = Object.freeze({ kind: 'OUTER_NETWORK_SESSION', runtime_authorized: false });
    minted.set(capability, state); return capability;
  } catch {
    // Only our minted descriptor is closed. IPC disconnect requests self-exit;
    // PID-based kill is deliberately absent. Failure is not a cleanup receipt.
    try { child.disconnect(); } catch { /* Report the failed acquisition. */ }
    let fdCloseUnproven = false;
    if (pin) { try { ports.close(pin); } catch { fdCloseUnproven = true; } }
    const error = new Error('OUTER_SESSION_ACQUISITION_FAILED'); error.code = 'OUTER_SESSION_ACQUISITION_FAILED';
    // Acquisition did not yield a usable capability. These resources must remain
    // pending in a future supervisor receipt, never be represented as clean.
    error.pending_resources = { anchorPid: Number.isSafeInteger(child.pid) ? child.pid : null, anchorExitUnproven: true, fdCloseUnproven };
    throw error;
  }
}

/** Internal trusted backend consumes the same pinned namespace, never JSON evidence. */
export function outerNetworkPin(capability) { return live(capability).pin; }
export function inspectOuterNetworkSession(capability) {
  const state = live(capability);
  return { schema_version: 1, status: 'BOUNDARY_READY', binding: { ...state.binding }, owner: structuredClone(state.owner),
    initialBoundary: structuredClone(state.initialBoundary), loopback: structuredClone(state.loopback), runtime_authorized: false, sql_authorized: false,
    real_execution: !state.test };
}

/** Call only AFTER every private daemon/client has been cleaned by its owner. */
export async function cleanupOuterNetworkSession(capability) {
  const state = minted.get(capability);
  requireThat(state, 'UNMINTED_OUTER_SESSION');
  if (state.phase === 'closed') return { status: 'ANCHOR_AND_FD_CLOSED', full_cleanup_verified: false, sql_authorized: false };
  requireThat(state.phase === 'ready', 'OUTER_CLEANUP_UNPROVEN');
  state.phase = 'closing';
  try {
    checkIdentity(state); state.child.stop();
    const exit = await bounded(state.child.finished, STOP_MS, 'ANCHOR_STOP_TIMEOUT');
    requireThat(exit.code === 0 && exit.signal === null && exit.error === false, 'ANCHOR_STOP_FAILED');
    state.ports.close(state.pin); state.child.disconnect(); state.phase = 'closed';
    return { status: 'ANCHOR_AND_FD_CLOSED', full_cleanup_verified: false, sql_authorized: false };
  } catch {
    state.cleanupError = true; state.phase = 'failed';
    try { state.child.disconnect(); } catch { /* No host PID kill fallback. */ }
    // FD may still be required by remaining owned processes; do not claim absence.
    fail('OUTER_CLEANUP_UNPROVEN');
  }
}

function anchorMain() {
  requireThat(process.argv.length === 4 && process.argv[2] === ANCHOR &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(process.argv[3]) && process.send,
  'INVALID_ANCHOR_INVOCATION');
  const nonce = process.argv[3];
  const deadline = setTimeout(() => process.exit(72), LIFETIME_MS);
  process.on('disconnect', () => { clearTimeout(deadline); process.exit(0); });
  process.on('message', message => {
    if (message && Object.keys(message).sort().join() === 'nonce,operation' && message.operation === 'stop' && message.nonce === nonce) {
      clearTimeout(deadline); process.exit(0);
    } else process.exit(73);
  });
  process.send({ event: 'ready', pid: process.pid, nonce, lifetimeMs: LIFETIME_MS });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) anchorMain();
