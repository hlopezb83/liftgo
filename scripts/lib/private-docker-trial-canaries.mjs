// Trusted supervisor listeners only. Default IO is real; tests replace every port.
// These observations never authorize SQL, replay, Docker, or arbitrary application code.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer, createConnection, isIP } from 'node:net';
import { createSocket } from 'node:dgram';
import { posix } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';

const sessions = new WeakMap();
const SAFE_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', TZ: 'UTC' });
const LISTENERS = Object.freeze([
  { role: 'ipv4', protocol: 'tcp', family: 4, address: '127.254.36.1', port: 0 },
  { role: 'ipv6', protocol: 'tcp', family: 6, address: '::1', port: 0 },
  { role: 'dnsLoopUdp', protocol: 'udp', family: 4, address: '127.254.36.1', port: 53 },
  { role: 'dnsLoopTcp', protocol: 'tcp', family: 4, address: '127.254.36.1', port: 53 },
  { role: 'dnsNonLoopUdp', protocol: 'udp', family: 4, address: '198.18.0.1', port: 53 },
  { role: 'dnsNonLoopTcp', protocol: 'tcp', family: 4, address: '198.18.0.1', port: 53 },
  { role: 'ipv6Benchmark', protocol: 'tcp', family: 6, address: 'fd00:360::1', port: 0 },
]);
const OWNED_ADDRESSES = Object.freeze([
  { family: 4, local: '198.18.0.1', prefixlen: 32 },
  { family: 6, local: 'fd00:360::1', prefixlen: 128 },
]);
function need(value, code) { if (!value) { const error = new Error(code); error.code = code; throw error; } }
function keys(value, names, code) { need(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...names].sort().join(), code); }
const copy = value => structuredClone(value);
function bounded(promise, milliseconds, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => {
    const error = new Error(code); error.code = code; reject(error);
  }, milliseconds); })]).finally(() => clearTimeout(timer));
}
function ip(args) {
  return execFileSync('/usr/sbin/ip', args, { cwd: '/', env: { ...SAFE_ENV }, shell: false,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 2_000, maxBuffer: 128 * 1024 });
}
function kernelIdentity() {
  const stat = readFileSync('/proc/self/stat', 'utf8'), end = stat.lastIndexOf(') ');
  need(stat.startsWith(`${process.pid} (`) && end >= 0, 'CANARY_SUPERVISOR_IDENTITY_UNPROVEN');
  const startTicks = stat.slice(end + 2).trim().split(/\s+/)[19];
  const links = JSON.parse(ip(['-j', 'link', 'show', 'dev', 'lo']));
  need(/^[1-9][0-9]*$/.test(startTicks ?? '') && links.length === 1 && links[0].ifname === 'lo' &&
    links[0].link_type === 'loopback' && links[0].flags.includes('LOOPBACK') && Number.isSafeInteger(links[0].ifindex), 'CANARY_SUPERVISOR_IDENTITY_UNPROVEN');
  return { pid: process.pid, startTicks, namespaceInode: statSync('/proc/self/ns/net').ino, loIfindex: links[0].ifindex };
}
function addressInventory() {
  const links = JSON.parse(ip(['-j', 'address', 'show', 'dev', 'lo']));
  need(links.length === 1 && links[0].ifname === 'lo' && Array.isArray(links[0].addr_info), 'CANARY_ADDRESS_INVENTORY_UNPROVEN');
  return { ifindex: links[0].ifindex, addresses: links[0].addr_info.map(row => ({ family: row.family === 'inet' ? 4 : row.family === 'inet6' ? 6 : 0,
    local: row.local, prefixlen: row.prefixlen, scope: row.scope, label: row.label ?? null,
    flags: [...new Set([...(row.flags ?? []), ...['tentative', 'dadfailed', 'deprecated', 'temporary', 'mngtmpaddr',
      'noprefixroute', 'dynamic', 'permanent', 'secondary', 'home', 'optimistic', 'nodad'].filter(flag => row[flag] === true)])].sort() })) };
}
function globalAddressInventory() {
  const links = JSON.parse(ip(['-j', 'address', 'show']));
  need(Array.isArray(links) && links.length > 0, 'GLOBAL_CANARY_ADDRESS_INVENTORY_UNPROVEN');
  return links.flatMap(link => {
    need(link && Number.isSafeInteger(link.ifindex) && link.ifindex > 0 && Array.isArray(link.addr_info), 'GLOBAL_CANARY_ADDRESS_INVENTORY_UNPROVEN');
    return link.addr_info.map(row => {
      need(row && ['inet', 'inet6'].includes(row.family) && isIP(row.local) === (row.family === 'inet' ? 4 : 6), 'GLOBAL_CANARY_ADDRESS_INVENTORY_UNPROVEN');
      return row.local;
    });
  });
}
function mutateAddress(operation, row) {
  const args = ['-' + row.family, 'address', operation, row.local + '/' + row.prefixlen, 'dev', 'lo'];
  if (operation === 'add') {
    if (row.family === 4) args.push('label', row.label);
    else args.push('nodad');
    args.push('scope', 'host', 'valid_lft', '900', 'preferred_lft', '900');
  }
  ip(args);
  return { acknowledged: true }; // execFileSync returns only after exit status 0.
}
function directoryIdentity(path) {
  need(typeof path === 'string' && /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(path) && posix.normalize(path) === path, 'INVALID_CANARY_DIRECTORY');
  const row = lstatSync(path);
  need(row.isDirectory() && !row.isSymbolicLink() && row.uid === 0 && (row.mode & 0o077) === 0 && realpathSync(path) === path, 'CANARY_DIRECTORY_NOT_PRIVATE');
  return row.ino;
}
function openListener(endpoint, nonce) {
  need(isIP(endpoint.address) === endpoint.family, 'NONNUMERIC_CANARY_ENDPOINT');
  return new Promise((resolve, reject) => {
    // The supervisor runs execFileSync probes. A worker event loop plus shared
    // atomic counters keeps receiving traffic while the main thread is blocked.
    const shared = new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT), counters = new Int32Array(shared);
    const worker = new Worker(new URL(import.meta.url), { workerData: { purpose: 'local-trial-canary-v2', endpoint, nonce, shared },
      env: { ...SAFE_ENV }, execArgv: [], stdout: true, stderr: true });
    worker.stdout.resume(); worker.stderr.resume();
    let exited = false, closed = false, sequence = 0, announced = false;
    const startupTimer = setTimeout(() => { void worker.terminate().finally(() => reject(new Error('CANARY_WORKER_START_TIMEOUT'))); }, 1_500);
    const pending = new Map();
    const finish = new Promise(done => worker.once('exit', code => { exited = true;
      clearTimeout(startupTimer);
      if (code !== 0 || Atomics.load(counters, 3) !== 3) Atomics.store(counters, 3, 4);
      if (!announced) reject(new Error('CANARY_WORKER_EXITED_BEFORE_READY')); done(code); }));
    worker.on('error', () => { clearTimeout(startupTimer); Atomics.store(counters, 3, 4); reject(new Error('CANARY_WORKER_FAILED')); });
    worker.on('message', message => {
      if (message?.event === 'barrier' && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    });
    worker.once('message', message => {
      clearTimeout(startupTimer);
      if (message?.event !== 'ready' || message.nonce !== nonce) { void worker.terminate().finally(() => reject(new Error('CANARY_WORKER_HANDSHAKE_UNPROVEN'))); return; }
      announced = true;
      resolve({ endpoint: message.endpoint, threadId: worker.threadId,
        alive: () => !closed && !exited && Atomics.load(counters, 3) === 1,
        counts: () => ({ total: Atomics.load(counters, 0), positive: Atomics.load(counters, 1), unexpected: Atomics.load(counters, 2) }),
        barrier: async () => {
          const id = ++sequence;
          const answer = new Promise(done => pending.set(id, done));
          worker.postMessage({ operation: 'barrier', id, nonce });
          const response = await bounded(answer, 1_000, 'CANARY_WORKER_BARRIER_TIMEOUT');
          need(response.nonce === nonce && response.role === endpoint.role && Atomics.load(counters, 3) === 1, 'CANARY_WORKER_BARRIER_UNPROVEN');
        },
        close: async () => {
          need(!closed, 'CANARY_LISTENER_ALREADY_CLOSED'); closed = true;
          worker.postMessage({ operation: 'close', nonce });
          try { need(await bounded(finish, 750, 'CANARY_WORKER_CLOSE_TIMEOUT') === 0 && Atomics.load(counters, 3) === 3, 'CANARY_WORKER_CLOSE_UNPROVEN'); }
          catch {
            // Termination only targets this minted Worker object, never a PID.
            // Forced removal is still an uncertain cleanup, not a PASS.
            await worker.terminate(); throw new Error('CANARY_WORKER_CLOSE_UNPROVEN');
          }
        } });
    });
  });
}

async function workerListener() {
  const { endpoint, nonce, shared } = workerData;
  need(workerData.purpose === 'local-trial-canary-v2' && parentPort && shared instanceof SharedArrayBuffer && shared.byteLength === 16 &&
    /^[0-9a-f-]{36}$/.test(nonce) && LISTENERS.some(row => JSON.stringify(row) === JSON.stringify(endpoint)), 'INVALID_CANARY_WORKER_INPUT');
  const counters = new Int32Array(shared), sockets = new Set();
  const positivePayload = Buffer.from(`positive:${nonce}:${endpoint.role}\n`), response = Buffer.from(JSON.stringify({ nonce, role: endpoint.role }));
  const server = endpoint.protocol === 'tcp' ? createServer(socket => {
    Atomics.add(counters, 0, 1); Atomics.add(counters, 2, 1); // A bare connection is unexpected until authenticated as our control.
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setTimeout(1_000, () => socket.destroy()); let received = Buffer.alloc(0), classified = false;
    socket.on('data', data => {
      if (classified) return;
      received = Buffer.concat([received, data]);
      if (received.length > 4096) { classified = true; socket.destroy(); return; }
      if (!received.includes(10)) return;
      classified = true;
      if (received.equals(positivePayload)) { Atomics.add(counters, 1, 1); Atomics.sub(counters, 2, 1); }
      socket.end(response);
    });
  }) : createSocket(endpoint.family === 4 ? 'udp4' : 'udp6');
  if (endpoint.protocol === 'udp') server.on('message', (data, source) => {
    Atomics.add(counters, 0, 1); Atomics.add(counters, data.equals(positivePayload) ? 1 : 2, 1);
    server.send(response, source.port, source.address, () => {});
  });
  let transportFailed = false;
  server.on('error', () => { transportFailed = true; Atomics.store(counters, 3, 4); });
  let closing = false;
  const close = async (failed = false) => {
    if (closing) return; closing = true; clearTimeout(deadline);
    // Keep receiving through one bounded settle interval and a poll/check turn.
    // The supervisor must stop producers before this final observation window.
    await new Promise(done => setTimeout(done, 50));
    await new Promise(done => setImmediate(done));
    for (const socket of sockets) socket.destroy();
    try { await new Promise((done, reject) => { try { server.close(error => error ? reject(error) : done()); } catch (error) { reject(error); } }); }
    catch { failed = true; }
    Atomics.store(counters, 3, failed || transportFailed ? 4 : 3); parentPort.close();
  };
  const deadline = setTimeout(() => { void close(true); }, 12 * 60 * 1000);
  parentPort.on('message', message => {
    if (message?.nonce !== nonce) { void close(true); return; }
    if (message.operation === 'close') { void close(); return; }
    if (message.operation === 'barrier' && Number.isSafeInteger(message.id) && message.id > 0) {
      // A bounded observation barrier, not proof against packets sent later.
      setTimeout(() => parentPort.postMessage({ event: 'barrier', id: message.id, nonce, role: endpoint.role }), 50);
    } else void close(true);
  });
  try {
    await new Promise((done, reject) => {
      server.once('error', reject);
      if (endpoint.protocol === 'tcp') { server.maxConnections = 64; server.listen({ host: endpoint.address, port: endpoint.port, exclusive: true, ipv6Only: endpoint.family === 6 }, done); }
      else server.bind({ address: endpoint.address, port: endpoint.port, exclusive: true }, done);
    });
    const bound = server.address(); Atomics.store(counters, 3, 1);
    parentPort.postMessage({ event: 'ready', nonce, endpoint: { ...endpoint, address: bound.address, port: bound.port } });
  } catch { await close(true); }
}
function request(endpoint, nonce) {
  need(isIP(endpoint.address) === endpoint.family, 'NONNUMERIC_CANARY_ENDPOINT');
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, data) => { if (done) return; done = true; clearTimeout(timer);
      if (endpoint.protocol === 'tcp') socket.destroy(); else { try { socket.close(); } catch {} }
      if (error) reject(new Error('CANARY_POSITIVE_REQUEST_FAILED')); else {
        try { resolve(JSON.parse(data.toString('utf8'))); } catch { reject(new Error('CANARY_POSITIVE_RESPONSE_INVALID')); }
      }
    };
    const socket = endpoint.protocol === 'tcp' ? createConnection({ host: endpoint.address, port: endpoint.port, family: endpoint.family })
      : createSocket(endpoint.family === 4 ? 'udp4' : 'udp6');
    const timer = setTimeout(() => finish(new Error('timeout')), 1_000);
    socket.on('error', error => finish(error));
    if (endpoint.protocol === 'tcp') {
      const chunks = []; let bytes = 0;
      socket.once('connect', () => socket.write(`positive:${nonce}:${endpoint.role}\n`));
      socket.on('data', data => { bytes += data.length; if (bytes > 4096) finish(new Error('oversize')); else chunks.push(data); });
      socket.on('end', () => finish(null, Buffer.concat(chunks)));
    } else {
      socket.once('message', (data, source) => {
        if (source.address !== endpoint.address || source.port !== endpoint.port || data.length > 4096) return finish(new Error('foreign response'));
        finish(null, data);
      });
      socket.send(Buffer.from(`positive:${nonce}:${endpoint.role}\n`), endpoint.port, endpoint.address, error => { if (error) finish(error); });
    }
  });
}
const DEFAULTS = Object.freeze({ uid: () => process.getuid(), identity: kernelIdentity, inventory: addressInventory,
  globalInventory: globalAddressInventory, mutate: mutateAddress, directory: directoryIdentity, open: openListener, request });
function drivers(options) {
  if (options && Object.keys(options).length === 0) return { io: DEFAULTS, fixture: false };
  keys(options, ['testDrivers'], 'PAIR_ALL_CANARY_TEST_DRIVERS');
  keys(options.testDrivers, Object.keys(DEFAULTS), 'PAIR_ALL_CANARY_TEST_DRIVERS');
  need(Object.values(options.testDrivers).every(value => typeof value === 'function'), 'INVALID_CANARY_TEST_DRIVER');
  return { io: options.testDrivers, fixture: true };
}
function normalizedInventory(state) {
  const inventory = state.io.inventory();
  keys(inventory, ['ifindex', 'addresses'], 'INVALID_CANARY_ADDRESS_INVENTORY');
  need(inventory.ifindex === state.identity.loIfindex && Array.isArray(inventory.addresses), 'CANARY_LOOPBACK_REPLACED');
  return inventory.addresses.map(row => {
    keys(row, ['family', 'local', 'prefixlen', 'scope', 'label', 'flags'], 'INVALID_CANARY_ADDRESS_ROW');
    need(isIP(row.local) === row.family && Number.isSafeInteger(row.prefixlen) && row.prefixlen >= 0 && row.prefixlen <= (row.family === 4 ? 32 : 128) &&
      typeof row.scope === 'string' && (row.label === null || typeof row.label === 'string') && Array.isArray(row.flags) &&
      row.flags.every(flag => typeof flag === 'string'), 'INVALID_CANARY_ADDRESS_ROW');
    return copy(row);
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function identity(state) {
  need(state.io.uid() === 0 && state.io.directory(state.directory) === state.directoryInode &&
    JSON.stringify(state.io.identity()) === JSON.stringify(state.identity), 'CANARY_SUPERVISOR_CHANGED');
}
function addresses(state) {
  identity(state);
  const expected = [...state.baseline, ...state.owned.map(row => row.observed)].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  need(JSON.stringify(normalizedInventory(state)) === JSON.stringify(expected), 'CANARY_ADDRESS_OWNERSHIP_CHANGED');
}
function live(cap) {
  const state = sessions.get(cap); need(state && state.phase === 'ready', 'CANARY_SESSION_NOT_LIVE');
  try { addresses(state); need(state.listeners.every(row => row.handle.alive()), 'CANARY_LISTENER_NOT_ALIVE'); }
  catch { state.phase = 'failed'; throw new Error('CANARY_SESSION_IDENTITY_UNPROVEN'); }
  return state;
}
function receiptCounts(state) {
  const result = { receipts: {}, positiveReceipts: {}, unexpectedReceipts: {} };
  for (const row of state.listeners) {
    const counts = row.handle.counts(); keys(counts, ['total', 'positive', 'unexpected'], 'CANARY_COUNTERS_UNPROVEN');
    need(Object.values(counts).every(value => Number.isSafeInteger(value) && value >= 0) && counts.total === counts.positive + counts.unexpected,
      'CANARY_COUNTERS_UNPROVEN');
    result.receipts[row.role] = counts.total; result.positiveReceipts[row.role] = counts.positive; result.unexpectedReceipts[row.role] = counts.unexpected;
  }
  return result;
}

export async function startTrialCanaries({ binding, directory }, options = {}) {
  const context = validateBinding(binding), { io, fixture } = drivers(options);
  need(io.uid() === 0, 'CANARIES_REQUIRE_ROOT');
  const state = { binding: context, io, fixture, directory, directoryInode: io.directory(directory), identity: io.identity(), owned: [],
    listeners: [], opening: 0, phase: 'preparing', busy: false };
  keys(state.identity, ['pid', 'startTicks', 'namespaceInode', 'loIfindex'], 'INVALID_CANARY_SUPERVISOR');
  need(Number.isSafeInteger(state.identity.pid) && state.identity.pid > 1 && /^[1-9][0-9]*$/.test(state.identity.startTicks) &&
    Number.isSafeInteger(state.identity.namespaceInode) && state.identity.namespaceInode > 0 && Number.isSafeInteger(state.identity.loIfindex) && state.identity.loIfindex > 0,
  'INVALID_CANARY_SUPERVISOR');
  state.baseline = normalizedInventory(state);
  const globalAddresses = io.globalInventory();
  need(Array.isArray(globalAddresses) && globalAddresses.length > 0 && globalAddresses.every(address => isIP(address) !== 0), 'GLOBAL_CANARY_ADDRESS_INVENTORY_UNPROVEN');
  need(OWNED_ADDRESSES.every(row => !globalAddresses.includes(row.local) && !state.baseline.some(existing => existing.local === row.local)),
    'CANARY_BENCHMARK_ADDRESS_ALREADY_PRESENT');
  const label = 'lo:lg' + createHash('sha256').update(context.nonce).digest('hex').slice(0, 8);
  try {
    for (const row of OWNED_ADDRESSES) {
      addresses(state); const requested = { ...row, ...(row.family === 4 ? { label } : {}) };
      const record = { requested, observed: null, acknowledged: false }; state.owned.push(record);
      const result = io.mutate('add', requested);
      need(result?.acknowledged === true, 'CANARY_ADD_ACKNOWLEDGEMENT_MISSING'); record.acknowledged = true;
      const created = normalizedInventory(state).filter(entry => entry.family === row.family && entry.local === row.local && entry.prefixlen === row.prefixlen);
      // Exclusive single-runner allocator: baseline absence + acknowledged add,
      // opaque in-memory journal and unchanged namespace/ifindex establish origin.
      // IPv4 additionally has a nonce label; IPv6 does not assume label support.
      need(created.length === 1 && created[0].scope === 'host' && (row.family !== 4 || created[0].label === label) &&
        !created[0].flags.some(flag => ['tentative', 'dadfailed'].includes(flag)), 'CANARY_ADDRESS_READBACK_UNPROVEN');
      record.observed = created[0]; addresses(state);
    }
    for (const endpoint of LISTENERS) {
      addresses(state);
      state.opening++;
      const handle = await bounded(Promise.resolve(io.open(copy(endpoint), context.nonce)).then(opened => {
        state.opening--;
        // Retain our own handle before endpoint validation can fail.
        if (opened && typeof opened.close === 'function') state.listeners.push({ role: endpoint.role, handle: opened });
        if (state.phase !== 'preparing' && opened && typeof opened.close === 'function') void opened.close().catch(() => {});
        return opened;
      }, error => { state.opening--; throw error; }), 2_000, 'CANARY_LISTENER_OPEN_TIMEOUT');
      need(handle && ['alive', 'close', 'counts', 'barrier'].every(name => typeof handle[name] === 'function') && handle.alive(), 'CANARY_LISTENER_UNPROVEN');
      const bound = handle.endpoint;
      need(bound.role === endpoint.role && bound.protocol === endpoint.protocol && bound.family === endpoint.family && bound.address === endpoint.address &&
        Number.isSafeInteger(bound.port) && bound.port > 0 && bound.port < 65536 && (endpoint.port === 0 || bound.port === endpoint.port), 'CANARY_LISTENER_ENDPOINT_CHANGED');
    }
    const cap = Object.freeze({ kind: 'LOCAL_TRIAL_CANARIES', sql_authorized: false });
    state.phase = 'ready'; sessions.set(cap, state); live(cap); return cap;
  } catch {
    state.phase = 'prepare-failed'; let rollbackUnproven = state.opening > 0;
    for (const row of [...state.listeners].reverse()) { try { await bounded(row.handle.close(), 1_000, 'CANARY_CLOSE_TIMEOUT'); } catch { rollbackUnproven = true; } }
    for (const row of [...state.owned].reverse()) { try {
      identity(state);
      if (row.observed === null) {
        const matching = normalizedInventory(state).filter(entry => entry.local === row.requested.local);
        if (matching.length === 0) { state.owned.pop(); addresses(state); continue; }
        need(row.acknowledged && matching.length === 1 && (row.requested.family !== 4 || matching[0].label === row.requested.label) && matching[0].family === row.requested.family &&
          matching[0].prefixlen === row.requested.prefixlen, 'PROVISIONAL_CANARY_ADDRESS_UNPROVEN');
        row.observed = matching[0];
      }
      addresses(state); need(io.mutate('del', row.requested)?.acknowledged === true, 'CANARY_DELETE_ACKNOWLEDGEMENT_MISSING'); state.owned.pop(); addresses(state);
    } catch { rollbackUnproven = true; break; } }
    const error = new Error('CANARY_PREPARATION_FAILED'); error.code = 'CANARY_PREPARATION_FAILED';
    error.pending_resources = { rollbackUnproven, addresses: copy(state.owned.map(row => row.requested)), listenerCleanupUnproven: rollbackUnproven };
    throw error;
  }
}

export function snapshotTrialCanaries(cap) {
  const state = live(cap);
  need(!state.busy, 'CANARY_OPERATION_BUSY');
  try { return { identity: { ...state.identity, nonce: state.binding.nonce }, binding: copy(state.binding),
    ...receiptCounts(state), endpoints: Object.fromEntries(state.listeners.map(row => [row.role, copy(row.handle.endpoint)])),
    kind: state.fixture ? 'fixture' : 'local-observation', sql_authorized: false }; }
  catch (error) { state.phase = 'failed'; throw error; }
}
export async function positiveTrialCanaries(cap) {
  const state = live(cap); need(!state.busy, 'CANARY_OPERATION_BUSY'); state.busy = true;
  try {
    const before = receiptCounts(state);
    need(Object.values(before.unexpectedReceipts).every(value => value === 0), 'CANARY_UNEXPECTED_RECEIPT');
    for (const row of state.listeners) {
      live(cap); const response = await bounded(state.io.request(copy(row.handle.endpoint), state.binding.nonce), 2_000, 'CANARY_POSITIVE_TIMEOUT');
      keys(response, ['nonce', 'role'], 'CANARY_POSITIVE_RESPONSE_INVALID');
      need(response.nonce === state.binding.nonce && response.role === row.role, 'CANARY_POSITIVE_UNPROVEN');
    }
    await Promise.all(state.listeners.map(row => bounded(row.handle.barrier(), 1_000, 'CANARY_BARRIER_TIMEOUT')));
    live(cap); const after = receiptCounts(state);
    for (const row of state.listeners) need(after.receipts[row.role] === before.receipts[row.role] + 1 &&
      after.positiveReceipts[row.role] === before.positiveReceipts[row.role] + 1 && after.unexpectedReceipts[row.role] === 0, 'CANARY_POSITIVE_UNPROVEN');
    return { status: 'LOCAL_CANARIES_POSITIVE', identity: { ...state.identity, nonce: state.binding.nonce }, binding: copy(state.binding),
      roles: state.listeners.map(row => row.role), ...after, sql_authorized: false };
  } catch { state.phase = 'failed'; throw new Error('CANARY_POSITIVE_UNPROVEN'); }
  finally { state.busy = false; }
}
export async function cleanupTrialCanaries(cap) {
  const state = sessions.get(cap); need(state && ['ready', 'failed'].includes(state.phase), 'CANARY_CLEANUP_PHASE_INVALID');
  need(!state.busy, 'CANARY_OPERATION_BUSY'); state.phase = 'cleaning';
  try {
    let listenerFailure = false;
    for (const row of [...state.listeners].reverse()) { try { await bounded(row.handle.close(), 1_000, 'CANARY_CLOSE_TIMEOUT'); } catch { listenerFailure = true; } }
    need(state.listeners.every(row => !row.handle.alive()), 'CANARY_LISTENERS_REMAIN');
    addresses(state);
    for (const row of [...state.owned].reverse()) { addresses(state); need(state.io.mutate('del', row.requested)?.acknowledged === true, 'CANARY_DELETE_ACKNOWLEDGEMENT_MISSING'); state.owned.pop(); addresses(state); }
    need(JSON.stringify(normalizedInventory(state)) === JSON.stringify(state.baseline), 'CANARY_ADDRESSES_REMAIN');
    need(!listenerFailure && Object.values(receiptCounts(state).unexpectedReceipts).every(value => value === 0), 'CANARY_CLEANED_WITH_UNPROVEN_RECEIPTS');
    state.phase = 'closed'; return { status: 'LOCAL_CANARIES_CLEANED', binding: copy(state.binding), sql_authorized: false, full_cleanup_verified: false };
  } catch {
    state.phase = 'cleanup-failed'; const error = new Error('CANARY_CLEANUP_UNPROVEN'); error.code = 'CANARY_CLEANUP_UNPROVEN';
    error.pending_resources = { addresses: copy(state.owned.map(row => row.requested)), listeners: state.listeners.map(row => row.role), rollbackUnproven: true }; throw error;
  }
}

if (!isMainThread && workerData?.purpose === 'local-trial-canary-v2') {
  workerListener().catch(() => { Atomics.store(new Int32Array(workerData.shared), 3, 4); parentPort.close(); });
}
