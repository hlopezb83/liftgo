import { createLocalId } from "@/lib/ids/localId";

/** Small local drafts only. No sessions, credentials, customer records or free text. */
export const FORM_DRAFT_PREFIX = "liftgo:form-drafts:v1:";
export const FORM_DRAFT_IDENTITY_KEY = `${FORM_DRAFT_PREFIX}identity`;
export const FORM_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Identity { scope: string | null; epoch: string }
// Logout must revoke this tab even if the browser refuses all storage operations.
let runtimeIdentity: Identity | null = null;
// Do not reuse persisted bytes after an identity change whose rotation failed.
let pendingStorageRotation = false;
export interface LocalFormDraft<T> {
  version: 1;
  id: string;
  revision: string;
  scope: string;
  epoch: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  values: T;
}
export class DraftStorageError extends Error {
  constructor(public readonly reason: "unavailable" | "conflict" | "expired") { super(reason); }
}
const token = createLocalId;
export const formDraftKey = (scope: string) => `${FORM_DRAFT_PREFIX}booking:${scope}`;
const revokedKey = (id: string) => `${FORM_DRAFT_PREFIX}revoked:${id}`;
const browserStorage = () => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};
function identity(storage: Storage): Identity | null {
  const raw = storage.getItem(FORM_DRAFT_IDENTITY_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return (typeof value.scope === "string" || value.scope === null) && typeof value.epoch === "string" ? value : null;
  } catch { return null; }
}

function pruneExpiredEntries(storage: Storage) {
  const expired: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && expiredEntry(storage, key)) expired.push(key);
  }
  expired.forEach((key) => storage.removeItem(key));
}
function expiredEntry(storage: Storage, key: string) {
  if (key.startsWith(`${FORM_DRAFT_PREFIX}revoked:`)) return Number(storage.getItem(key)) <= Date.now();
  if (!key.startsWith(`${FORM_DRAFT_PREFIX}booking:`)) return false;
  try {
    const expiresAt = JSON.parse(storage.getItem(key) ?? "null").expiresAt;
    return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
  } catch { return true; }
}
function validEnvelope<T>(draft: LocalFormDraft<T>, scope: string, epoch: string | undefined, now: number) {
  return draft.version === 1 && draft.scope === scope && draft.epoch === epoch &&
    typeof draft.id === "string" && typeof draft.revision === "string" &&
    Number.isSafeInteger(draft.createdAt) && Number.isSafeInteger(draft.updatedAt) &&
    draft.createdAt <= draft.updatedAt && draft.updatedAt <= now &&
    draft.expiresAt === draft.createdAt + FORM_DRAFT_TTL_MS;
}

function syncRuntimeIdentity(scope: string | null) {
  if (scope === null || (runtimeIdentity && runtimeIdentity.scope !== scope)) pendingStorageRotation = true;
  if (!runtimeIdentity || runtimeIdentity.scope !== scope || scope === null) runtimeIdentity = { scope, epoch: token() };
}

/** Only call for a VERIFIED identity, or explicit sign-out. Never for loading. */
export function syncFormDraftIdentity(scope: string | null, storage = browserStorage()) {
  syncRuntimeIdentity(scope);
  if (!storage) return;
  try {
    if (!pendingStorageRotation && scope !== null && identity(storage)?.scope === scope) {
      pruneExpiredEntries(storage);
      return;
    }
    // Rotate the epoch first. Late writes from previous tabs cannot be read.
    try {
      storage.setItem(FORM_DRAFT_IDENTITY_KEY, JSON.stringify({ scope, epoch: token() }));
      pendingStorageRotation = false;
    } catch {
      pendingStorageRotation = true;
      storage.removeItem(FORM_DRAFT_IDENTITY_KEY);
    }
    const remove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(FORM_DRAFT_PREFIX) && key !== FORM_DRAFT_IDENTITY_KEY) remove.push(key);
    }
    remove.forEach((key) => storage.removeItem(key));
  } catch { /* Denied/quota storage must not prevent login or form entry. */ }
}

/** A per-mount lease plus revision checks prevent stale tabs overwriting a draft. */
export function openFormDraftStore<T>(scope: string, parseValues: (input: unknown) => T, storage = browserStorage()) {
  let lease: Identity | null = null;
  const runtimeEpoch = runtimeIdentity?.epoch;
  try { lease = storage ? identity(storage) : null; } catch { /* memory only */ }
  const guard = () => {
    if (runtimeIdentity?.scope !== scope || runtimeIdentity?.epoch !== runtimeEpoch) throw new DraftStorageError("conflict");
    if (pendingStorageRotation || !storage || !lease) throw new DraftStorageError("unavailable");
    if (lease.scope !== scope || identity(storage)?.epoch !== lease.epoch) throw new DraftStorageError("conflict");
    return storage;
  };
  const read = (now = Date.now()): LocalFormDraft<T> | null => {
    try {
      const s = guard();
      const raw = s.getItem(formDraftKey(scope));
      if (!raw) return null;
      let draft: LocalFormDraft<T>;
      try {
        draft = JSON.parse(raw);
        if (!validEnvelope(draft, scope, lease?.epoch, now) || s.getItem(revokedKey(draft.id))) throw new Error("invalid draft");
        draft = { ...draft, values: parseValues(draft.values) };
      } catch {
        s.removeItem(formDraftKey(scope));
        return null;
      }
      if (now >= draft.expiresAt) {
        s.setItem(revokedKey(draft.id), String(draft.expiresAt));
        s.removeItem(formDraftKey(scope));
        return null;
      }
      return draft;
    } catch (error) {
      if (error instanceof DraftStorageError) throw error;
      throw new DraftStorageError("unavailable");
    }
  };
  const assertCurrent = (expected: LocalFormDraft<T> | null, now = Date.now()) => {
    if (expected && now >= expected.expiresAt) throw new DraftStorageError("expired");
    const current = read(now);
    if ((current?.revision ?? null) !== (expected?.revision ?? null)) throw new DraftStorageError("conflict");
    return current;
  };
  return {
    read,
    assertCurrent,
    write(values: T, expected: LocalFormDraft<T> | null, now = Date.now()): LocalFormDraft<T> {
      try {
        const s = guard();
        assertCurrent(expected, now);
        const draft: LocalFormDraft<T> = {
          version: 1, id: expected?.id ?? token(), revision: token(), scope, epoch: lease?.epoch ?? "",
          createdAt: expected?.createdAt ?? now, updatedAt: now,
          expiresAt: expected?.expiresAt ?? now + FORM_DRAFT_TTL_MS, values: parseValues(values),
        };
        // Tombstones also protect against a cross-tab remove between read/write.
        if (s.getItem(revokedKey(draft.id))) throw new DraftStorageError("conflict");
        s.setItem(formDraftKey(scope), JSON.stringify(draft));
        return draft;
      } catch (error) {
        if (error instanceof DraftStorageError) throw error;
        throw new DraftStorageError("unavailable");
      }
    },
    clear(expected: LocalFormDraft<T> | null) {
      try {
        if (!expected || !storage) return;
        // Revoke this exact draft even if its owner unmounted during creation.
        let revoked = false;
        try { storage.setItem(revokedKey(expected.id), String(expected.expiresAt)); revoked = true; } catch { /* try removal */ }
        try {
          // Removing does not consume quota; a tombstone also invalidates unreadable bytes.
          const raw = storage.getItem(formDraftKey(scope));
          if (raw && JSON.parse(raw).id === expected.id) storage.removeItem(formDraftKey(scope));
        } catch (error) { if (!revoked) throw error; }

      } catch { throw new DraftStorageError("unavailable"); }
    },
  };
}
