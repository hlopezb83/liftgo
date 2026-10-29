// Composition of the real infrastructure primitives. No Supabase/SQL/app entry.
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { validateBinding } from './ephemeral-bootstrap-contract.mjs';
import { createOuterNetworkSession, outerNetworkPin, inspectOuterNetworkSession, cleanupOuterNetworkSession } from './outer-network-session.mjs';
import { createPrivateDockerBackend, startPrivateDockerBackend, inspectPrivateDockerBackend, cleanupPrivateDockerBackend } from './private-docker-backend.mjs';

const DEFAULTS = Object.freeze({ createOuterNetworkSession, outerNetworkPin, inspectOuterNetworkSession, cleanupOuterNetworkSession,
  createPrivateDockerBackend, startPrivateDockerBackend, inspectPrivateDockerBackend, cleanupPrivateDockerBackend });
const sessions = new WeakMap();
function need(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
function ports(options) {
  need(options && typeof options === 'object' && !Array.isArray(options), 'INVALID_ISOLATED_SESSION_DRIVERS');
  if (Object.keys(options).length === 0) return { io: DEFAULTS, fixture: false };
  need(Object.keys(options).join() === 'testDrivers' && options.testDrivers &&
    Object.keys(options.testDrivers).sort().join() === Object.keys(DEFAULTS).sort().join() &&
    Object.values(options.testDrivers).every(value => typeof value === 'function'), 'PAIR_ALL_ISOLATED_SESSION_DRIVERS');
  return { io: options.testDrivers, fixture: true };
}
function stateFor(cap, phases) {
  const state = sessions.get(cap); need(state && phases.includes(state.phase), 'ISOLATED_SESSION_PHASE_INVALID'); return state;
}
function observations(state) {
  const outer = state.io.inspectOuterNetworkSession(state.outer), docker = state.io.inspectPrivateDockerBackend(state.backend);
  assert.deepEqual(outer.binding, state.binding, 'Foreign outer session');
  assert.deepEqual(docker.binding, state.binding, 'Foreign private backend');
  need(outer.status === 'BOUNDARY_READY' && docker.status === 'PRIVATE_DAEMONS_OBSERVED' &&
    outer.owner.anchor.namespaceInode === docker.namespaceInode && docker.bridge === 'normal' &&
    outer.runtime_authorized === false && docker.replay_authorized === false, 'ISOLATED_COMPONENTS_UNPROVEN');
  return { schema_version: 1, kind: state.fixture ? 'fixture' : 'infrastructure-observation', status: 'ISOLATED_DOCKER_OBSERVED',
    binding: { ...state.binding }, outer, docker, sql_authorized: false, replay_authorized: false, runtime_validated: false };
}

/** No historical SQL, registry access, containers or application commands. */
export async function prepareIsolatedDockerSession({ binding, runnerTemp, toolchain, trialResolver }, options = {}) {
  const context = validateBinding(binding), { io, fixture } = ports(options);
  const outer = await io.createOuterNetworkSession({ binding: context });
  try {
    const observed = io.inspectOuterNetworkSession(outer);
    assert.deepEqual(observed.binding, context); need(observed.status === 'BOUNDARY_READY', 'OUTER_NOT_READY');
    const backend = io.createPrivateDockerBackend({ binding: context, runnerTemp, pin: io.outerNetworkPin(outer), toolchain,
      ...(trialResolver === undefined ? {} : { trialResolver }) });
    const cap = Object.freeze({ kind: 'ISOLATED_DOCKER_SESSION', sql_authorized: false });
    sessions.set(cap, { binding: context, io, fixture, outer, backend, toolchain: structuredClone(toolchain), phase: 'prepared' }); return cap;
  } catch (cause) {
    // Failed private preparation must itself report rollback uncertainty. Closing
    // the inert anchor never certifies that directories/cgroups were removed.
    let anchorCleanupUnproven = false;
    try { await io.cleanupOuterNetworkSession(outer); } catch { anchorCleanupUnproven = true; }
    const error = new Error('ISOLATED_SESSION_PREPARATION_FAILED'); error.code = 'ISOLATED_SESSION_PREPARATION_FAILED';
    error.pending_resources = { privatePreparationUnproven: true, anchorCleanupUnproven,
      privateResources: cause?.pending_resources ?? null };
    throw error;
  }
}

export async function startIsolatedDockerSession(cap) {
  const state = stateFor(cap, ['prepared']); state.phase = 'starting';
  try {
    state.io.inspectOuterNetworkSession(state.outer); // Recheck ownership immediately before the daemon launch.
    await state.io.startPrivateDockerBackend(state.backend);
    const receipt = observations(state); state.phase = 'started'; return receipt;
  } catch { state.phase = 'start-failed'; need(false, 'ISOLATED_DOCKER_START_FAILED_CLEANUP_REQUIRED'); }
}
export function inspectIsolatedDockerSession(cap) {
  const state = stateFor(cap, ['started']);
  try { return observations(state); }
  catch { state.phase = 'start-failed'; need(false, 'ISOLATED_DOCKER_OBSERVATION_FAILED'); }
}

// Trusted, in-process trial consumer only. JSON cannot recreate this FD capability.
export function privateDockerTrialContext(cap) {
  const state = stateFor(cap, ['started']), receipt = observations(state), docker = receipt.docker;
  need(docker.trialResolver === 'private-docker-trial-v2' &&
    docker.resolverConfigSha256 === '3040f26161cf270f957c7ddc73dd5d18a25cbfe03cbd63cbef355c0d891942ec' &&
    docker.resolverControl?.contentVerified === true && docker.resolverControl.readOnly === true &&
    docker.resolverControl.mountNamespaceInode === docker.mountNamespaceInode && docker.resolverControl.target === '/etc/resolv.conf',
  'TRIAL_RESOLVER_NOT_OBSERVED');
  need(typeof state.toolchain?.docker?.path === 'string' && docker.dockerHost.startsWith('unix:///'), 'TRIAL_CLIENT_NOT_OBSERVED');
  const directory = dirname(docker.dockerHost.slice('unix://'.length));
  return { pin: state.io.outerNetworkPin(state.outer), dockerHost: docker.dockerHost, dockerPath: state.toolchain.docker.path,
    clientDirectory: directory + '/client', dataRoot: directory + '/data',
    resolver: { daemonAddress: '127.254.36.1', sandboxAddress: '198.18.0.1', configuredBeforeDaemon: true } };
}

export async function cleanupIsolatedDockerSession(cap) {
  const state = stateFor(cap, ['prepared', 'started', 'start-failed']); state.phase = 'cleaning';
  let privateCleanupObserved = false;
  try {
    const docker = await state.io.cleanupPrivateDockerBackend(state.backend);
    assert.deepEqual(docker.binding, state.binding);
    need(docker.status === 'PRIVATE_DAEMONS_CLEANED' && docker.replay_authorized === false, 'PRIVATE_CLEANUP_UNPROVEN');
    privateCleanupObserved = true;
    const outer = await state.io.cleanupOuterNetworkSession(state.outer);
    need(outer.status === 'ANCHOR_AND_FD_CLOSED' && outer.full_cleanup_verified === false, 'OUTER_CLEANUP_UNPROVEN');
    state.phase = 'closed';
    // Probe observers, canaries, ephemeral image payloads and runner-wide inventories
    // belong to the future trial supervisor. This is never its full cleanup PASS.
    return { status: 'ISOLATED_DOCKER_COMPONENTS_CLEANED', binding: { ...state.binding },
      kind: state.fixture ? 'fixture' : 'infrastructure-observation', full_cleanup_verified: false,
      sql_authorized: false, replay_authorized: false, runtime_validated: false };
  } catch (cause) {
    state.phase = 'cleanup-failed';
    const error = new Error('ISOLATED_DOCKER_CLEANUP_UNPROVEN'); error.code = 'ISOLATED_DOCKER_CLEANUP_UNPROVEN';
    error.pending_resources = { privateCleanupObserved, outerAnchorCleanupUnproven: true,
      privateResources: cause?.pending_resources ?? null };
    throw error;
  }
}
