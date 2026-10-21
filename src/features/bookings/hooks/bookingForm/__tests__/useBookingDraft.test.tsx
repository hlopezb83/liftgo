import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formDraftKey, FORM_DRAFT_IDENTITY_KEY, FORM_DRAFT_TTL_MS, openFormDraftStore, syncFormDraftIdentity } from "@/lib/storage/formDraftStorage";
import { bookingDraftSchema, emptyBookingForm } from "../../../lib/bookingDraft";
import type { BookingFormData } from "../../../lib/bookingFormSchema";
import { useBookingDraft } from "../useBookingDraft";

const h = vi.hoisted(() => ({ scope: "user-a:org-a:internal" as string | null, guard: vi.fn() }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => h.scope }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: (...args: unknown[]) => h.guard(...args) }));
const scope = "user-a:org-a:internal";
const equipment = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000002";
const open = () => openFormDraftStore(scope, (v) => bookingDraftSchema.parse(v));
const mount = () => renderHook(() => {
  const form = useForm<BookingFormData>({ defaultValues: emptyBookingForm() });
  return { form, draft: useBookingDraft(form) };
});
const guard = () => h.guard.mock.lastCall?.[0]() as boolean;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T18:00:00Z")); localStorage.clear(); h.scope = scope; syncFormDraftIdentity(scope); h.guard.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useBookingDraft", () => {
  it("saves date endpoints, equipment, customer and recurrence but never free-form personal data", () => {
    const { result } = mount();
    act(() => {
      result.current.form.setValue("date_range", { from: new Date(2026, 9, 20), to: new Date(2026, 10, 20) });
      result.current.form.setValue("forklift_id", equipment);
      result.current.form.setValue("customer_id", customer);
      result.current.form.setValue("recurring_billing", true);
      result.current.form.setValue("customer_name", "PRIVATE_NAME");
      result.current.form.setValue("customer_contact", "PRIVATE_CONTACT");
    });
    expect(open().read()?.values).toEqual({ forklift_id: equipment, customer_id: customer, from: "2026-10-20", to: "2026-11-20", recurring_billing: true });
    expect(localStorage.getItem(formDraftKey(scope))).not.toMatch(/PRIVATE_/);
    expect(guard()).toBe(true);
    expect(result.current.draft.status).toBe("saved");
  });
  it.each(["customer_name", "customer_contact"] as const)("warns on %s only without storing personal data", (field) => {
    const { result } = mount();
    act(() => result.current.form.setValue(field, "private"));
    expect(guard()).toBe(true);
    expect(result.current.draft.hasChanges).toBe(true);
    expect(open().read()).toBeNull();
  });
  it("offers restoration, does not auto-fill or overwrite it, and never submits", () => {
    const saved = open().write({ forklift_id: equipment, customer_id: customer, from: "2026-10-20", recurring_billing: false }, null);
    const { result } = mount();
    expect(result.current.draft.candidate?.id).toBe(saved.id);
    expect(result.current.draft.submitBlocked).toBe(true);
    expect(result.current.form.getValues()).toEqual(emptyBookingForm());
    expect(result.current.draft.canSubmit()).toBe(false);
    act(() => result.current.draft.restore());
    expect(result.current.form.getValues("forklift_id")).toBe(equipment);
    expect(result.current.draft.expiresAt).toBe(saved.expiresAt);
    expect(result.current.draft.candidate).toBeNull();
    expect(result.current.draft.canSubmit()).toBe(true);
    expect(open().read()?.revision).toBe(saved.revision);
  });
  it("discard resets all fields and cannot be resurrected by watch or remount", () => {
    const a = mount();
    act(() => a.result.current.form.setValue("forklift_id", equipment));
    act(() => a.result.current.draft.discard());
    expect(a.result.current.form.getValues()).toEqual(emptyBookingForm());
    expect(guard()).toBe(false);
    expect(open().read()).toBeNull();
    a.unmount(); const b = mount();
    expect(b.result.current.draft.candidate).toBeNull();
  });
  it("creation prevents later autosave and disables duplicate submission", () => {
    const { result } = mount();
    act(() => result.current.form.setValue("forklift_id", equipment));
    const complete = result.current.draft.captureCompletion();
    act(complete);
    act(() => result.current.form.setValue("customer_name", "late render"));
    expect(open().read()).toBeNull();
    expect(result.current.draft.status).toBe("created");
    expect(result.current.draft.canSubmit()).toBe(false);
    expect(guard()).toBe(false);
  });
  it("late successful creation removes the exact draft after unmount", () => {
    const a = mount();
    act(() => a.result.current.form.setValue("forklift_id", equipment));
    const complete = a.result.current.draft.captureCompletion();
    a.unmount(); complete();
    expect(open().read()).toBeNull();
    const b = mount(); expect(b.result.current.draft.candidate).toBeNull();
  });
  it("normal unmount/remount preserves an unfinished draft", () => {
    const a = mount(); act(() => a.result.current.form.setValue("forklift_id", equipment)); a.unmount();
    const b = mount(); expect(b.result.current.draft.candidate).not.toBeNull();
  });
  it("does not purge during transient unresolved identity, and changes never cross scopes", () => {
    const a = mount(); act(() => a.result.current.form.setValue("forklift_id", equipment));
    h.scope = null; a.rerender();
    expect(localStorage.getItem(formDraftKey(scope))).not.toBeNull();
    expect(a.result.current.form.getValues()).toEqual(emptyBookingForm());
    h.scope = scope; a.rerender(); expect(a.result.current.draft.candidate).not.toBeNull();
    syncFormDraftIdentity("user-a:org-b:internal"); h.scope = "user-a:org-b:internal"; a.rerender();
    expect(a.result.current.draft.candidate).toBeNull();
    expect(a.result.current.form.getValues()).toEqual(emptyBookingForm());
    expect(localStorage.getItem(formDraftKey(scope))).toBeNull();
  });
  it("a logout in another tab blocks the old form and cannot re-autosave", () => {
    const { result } = mount(); act(() => result.current.form.setValue("forklift_id", equipment));
    act(() => { syncFormDraftIdentity(null); window.dispatchEvent(new StorageEvent("storage", { key: FORM_DRAFT_IDENTITY_KEY })); });
    act(() => result.current.form.setValue("customer_id", customer));
    expect(localStorage.getItem(formDraftKey(scope))).toBeNull();
    expect(result.current.draft.status).toBe("conflict");
    expect(result.current.draft.canSubmit()).toBe(false);
  });
  it("a newer tab revision blocks stale submission and preserves the newer draft", () => {
    const { result } = mount(); act(() => result.current.form.setValue("forklift_id", equipment));
    const other = open(); const latest = other.write({ forklift_id: equipment, customer_id: customer, recurring_billing: true }, other.read());
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: formDraftKey(scope) })));
    expect(result.current.draft.status).toBe("conflict");
    expect(result.current.draft.canSubmit()).toBe(false);
    act(() => result.current.draft.reload());
    expect(result.current.draft.candidate?.revision).toBe(latest.revision);
  });
  it("a successful booking in another tab cannot be duplicated from the old form", () => {
    const { result } = mount(); act(() => result.current.form.setValue("forklift_id", equipment));
    const other = open(); other.clear(other.read());
    act(() => expect(result.current.draft.canSubmit()).toBe(false));
    expect(result.current.draft.status).toBe("conflict");
  });
  it("expires a continuously mounted tab, and restore/edit never renews the original 7 days", () => {
    const a = mount(); act(() => a.result.current.form.setValue("forklift_id", equipment));
    const expires = a.result.current.draft.expiresAt;
    act(() => vi.advanceTimersByTime(FORM_DRAFT_TTL_MS - 100));
    act(() => a.result.current.form.setValue("customer_id", customer));
    expect(a.result.current.draft.expiresAt).toBe(expires);
    act(() => vi.advanceTimersByTime(100));
    expect(a.result.current.draft.status).toBe("expired");
    expect(a.result.current.draft.canSubmit()).toBe(false);
    expect(open().read()).toBeNull();
  });
  it("logout still revokes manual creation when storage is completely unavailable", () => {
    const { result } = mount();
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("denied"); });
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("denied"); });
    const remove = vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new DOMException("denied"); });
    try {
      act(() => result.current.form.setValue("forklift_id", equipment));
      act(() => syncFormDraftIdentity(null));
      act(() => expect(result.current.draft.canSubmit()).toBe(false));
      expect(result.current.draft.status).toBe("conflict");
    } finally { read.mockRestore(); write.mockRestore(); remove.mockRestore(); }
  });
  it("reports denied cleanup rather than claiming the local copy was removed", () => {
    const { result } = mount();
    act(() => result.current.form.setValue("forklift_id", equipment));
    const complete = result.current.draft.captureCompletion();
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new DOMException("denied"); });
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("denied"); });
    try {
      act(complete);
      expect(result.current.draft.status).toBe("created-unavailable");
      expect(result.current.draft.canSubmit()).toBe(false);
      expect(guard()).toBe(false);
    } finally { read.mockRestore(); write.mockRestore(); }
  });
  it("quota failures keep capture and explicit creation usable, with unsaved warning", () => {
    const { result } = mount();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("quota"); });
    act(() => result.current.form.setValue("forklift_id", equipment));
    expect(result.current.draft.status).toBe("unavailable");
    expect(result.current.form.getValues("forklift_id")).toBe(equipment);
    expect(result.current.draft.canSubmit()).toBe(true);
    expect(guard()).toBe(true);
  });
});
