import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftStorageError, FORM_DRAFT_IDENTITY_KEY, FORM_DRAFT_TTL_MS, formDraftKey, openFormDraftStore, syncFormDraftIdentity } from "../formDraftStorage";
import { bookingDraftSchema } from "@/features/bookings/lib/bookingDraft";

const storage: Storage = new (class {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
})();
const scope = "user-a:org-a:internal";
const other = "user-b:org-b:internal";
const values = { forklift_id: "00000000-0000-4000-8000-000000000001", customer_id: "", from: "2026-10-20", recurring_billing: false };
const open = (key = scope) => openFormDraftStore(key, (v) => bookingDraftSchema.parse(v), storage);
const now = Date.now();
beforeEach(() => { vi.restoreAllMocks(); storage.clear(); syncFormDraftIdentity(scope, storage); });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("local form draft storage", () => {
  it("works without crypto and revokes stale leases across logout and identity changes", () => {
    vi.stubGlobal("crypto", undefined);
    syncFormDraftIdentity(scope, storage);
    const store = open();
    const draft = store.write(values, null, now);
    expect(store.read(now)).toEqual(draft);
    expect(() => syncFormDraftIdentity(null, storage)).not.toThrow();
    syncFormDraftIdentity(other, storage);
    expect(open(other).read()).toBeNull();
    expect(() => store.write(values, draft, now + 1)).toThrow(new DraftStorageError("conflict"));
  });
  it("does not resurrect a draft after storage denied logout and same-user login", () => {
    const store = open();
    const draft = store.write(values, null, now);
    vi.stubGlobal("crypto", undefined);
    const denied = new Proxy(storage, { get() { throw new Error("storage denied"); } });
    expect(() => syncFormDraftIdentity(null, denied)).not.toThrow();
    expect(() => syncFormDraftIdentity(scope, denied)).not.toThrow();
    expect(() => open().read()).toThrow(new DraftStorageError("unavailable"));
    syncFormDraftIdentity(scope, storage);
    expect(open().read()).toBeNull();
    expect(() => store.write(values, draft, now + 1)).toThrow(new DraftStorageError("conflict"));
  });
  it("round-trips only allowlisted fields and fixes expiry at creation", () => {
    const store = open();
    const first = store.write(values, null, now);
    const second = store.write({ ...values, recurring_billing: true }, first, now + 1000);
    expect(second.createdAt).toBe(now);
    expect(second.expiresAt).toBe(now + FORM_DRAFT_TTL_MS);
    expect(store.read(now + 1001)).toEqual(second);
    expect(JSON.parse(storage.getItem(formDraftKey(scope)) ?? "null").values).toEqual({ ...values, recurring_billing: true });
  });
  it("expires at the exact boundary, not seven days after each restore", () => {
    const store = open(); const first = store.write(values, null, now);
    expect(store.read(first.expiresAt - 1)).not.toBeNull();
    expect(store.read(first.expiresAt)).toBeNull();
    expect(storage.getItem(formDraftKey(scope))).toBeNull();
    expect(() => store.write(values, first, first.expiresAt)).toThrow(new DraftStorageError("expired"));
  });
  it.each(["{invalid", JSON.stringify({ version: 999 }), JSON.stringify({ version: 1, expiresAt: "forever" })])("discards corrupt/version-incompatible payload: %s", (raw) => {
    storage.setItem(formDraftKey(scope), raw);
    expect(open().read()).toBeNull();
    expect(storage.getItem(formDraftKey(scope))).toBeNull();
  });
  it("rejects future clock rollback and forged extended expiration", () => {
    const store = open(); const draft = store.write(values, null, now);
    expect(store.read(now - 1)).toBeNull();
    storage.setItem(formDraftKey(scope), JSON.stringify({ ...draft, expiresAt: draft.expiresAt + 1 }));
    expect(store.read(now)).toBeNull();
  });
  it("rejects free-text / token injection, invalid references and invalid civil dates", () => {
    for (const value of [{ ...values, token: "secret" }, { ...values, customer_name: "PII" }, { ...values, from: "2026-02-30" }, { ...values, forklift_id: "malformed" }]) {
      expect(() => open().write(value, null, now)).toThrow();
      expect(storage.getItem(formDraftKey(scope))).toBeNull();
    }
  });
  it("never reads or writes a different user's or organization's slot", () => {
    const first = open().write(values, null, now);
    storage.setItem(formDraftKey(other), JSON.stringify(first));
    expect(() => open(other).read()).toThrow(new DraftStorageError("conflict"));
    syncFormDraftIdentity(other, storage);
    expect(open(other).read()).toBeNull();
    expect(storage.getItem(formDraftKey(scope))).toBeNull();
  });
  it("logout revokes old leases and re-login never restores the old draft", () => {
    const store = open(); const draft = store.write(values, null, now);
    syncFormDraftIdentity(null, storage);
    expect(() => store.write(values, draft, now + 1)).toThrow(new DraftStorageError("conflict"));
    syncFormDraftIdentity(scope, storage);
    expect(open().read(now + 2)).toBeNull();
    expect(() => store.write(values, null, now + 2)).toThrow(new DraftStorageError("conflict"));
  });
  it("re-confirming the same identity preserves draft and epoch across reloads", () => {
    const first = open().write(values, null, now);
    const epoch = storage.getItem(FORM_DRAFT_IDENTITY_KEY);
    syncFormDraftIdentity(scope, storage);
    expect(storage.getItem(FORM_DRAFT_IDENTITY_KEY)).toBe(epoch);
    expect(open().read(now + 1)?.id).toBe(first.id);
  });
  it("a second tab cannot overwrite a newer revision or create over an existing draft", () => {
    const a = open(), b = open(); const first = a.write(values, null, now);
    const second = b.write({ ...values, recurring_billing: true }, b.read(now), now + 1);
    expect(() => a.write(values, first, now + 2)).toThrow(new DraftStorageError("conflict"));
    expect(() => a.write(values, null, now + 2)).toThrow(new DraftStorageError("conflict"));
    expect(a.read(now + 3)?.revision).toBe(second.revision);
  });
  it("success/discard revokes a draft even if a late tab writes its old bytes", () => {
    const store = open(); const draft = store.write(values, null, now);
    store.clear(draft);
    storage.setItem(formDraftKey(scope), JSON.stringify(draft));
    expect(store.read(now + 1)).toBeNull();
    expect(() => store.write(values, draft, now + 1)).toThrow(new DraftStorageError("conflict"));
  });
  it("an old completion cannot delete a newer independent draft", () => {
    const store = open(); const old = store.write(values, null, now);
    store.clear(old); const next = store.write(values, null, now + 1);
    store.clear(old);
    expect(store.read(now + 2)?.id).toBe(next.id);
  });
  it("storage denial, quota and SSR are reported without throwing from identity lifecycle", () => {
    const store = open();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("quota"); });
    expect(() => store.write(values, null, now)).toThrow(new DraftStorageError("unavailable"));
    expect(() => syncFormDraftIdentity(null, storage)).not.toThrow();
    expect(() => openFormDraftStore(scope, (v) => v, null).read()).toThrow(new DraftStorageError("conflict"));
    syncFormDraftIdentity(scope, null);
    expect(() => openFormDraftStore(scope, (v) => v, null).read()).toThrow(new DraftStorageError("unavailable"));
  });
  it("quota cannot prevent removal of a successfully created draft", () => {
    const store = open(); const first = store.write(values, null, now);
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("quota"); });
    expect(() => store.clear(first)).not.toThrow();
    expect(storage.getItem(formDraftKey(scope))).toBeNull();
  });
});
