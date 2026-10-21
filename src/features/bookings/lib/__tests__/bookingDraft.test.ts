import { describe, expect, it } from "vitest";
import { bookingDraftSchema, bookingFormHasChanges, emptyBookingForm, restoreBookingDraft, toBookingDraft } from "../bookingDraft";

describe("minimal booking draft", () => {
  it("preserves civil calendar dates and strips manually entered personal data", () => {
    const form = { ...emptyBookingForm(), date_range: { from: new Date(2026, 9, 20), to: new Date(2026, 10, 3) }, customer_name: "Private name", customer_contact: "Private contact" };
    const draft = toBookingDraft(form);
    expect(draft).toEqual({ forklift_id: "", customer_id: "", from: "2026-10-20", to: "2026-11-03", recurring_billing: false });
    const restored = restoreBookingDraft(bookingDraftSchema.parse(JSON.parse(JSON.stringify(draft))));
    expect(restored.date_range.from?.getDate()).toBe(20);
    expect(restored.date_range.to?.getMonth()).toBe(10);
    expect(restored.customer_name).toBe("");
    expect(restored.customer_contact).toBe("");
  });
  it.each(["customer_name", "customer_contact", "forklift_id", "customer_id"] as const)("guards %s even without RHF shouldDirty", (field) => {
    expect(bookingFormHasChanges({ ...emptyBookingForm(), [field]: "changed" })).toBe(true);
  });
  it("guards both date boundaries and recurrence independently", () => {
    expect(bookingFormHasChanges(emptyBookingForm())).toBe(false);
    expect(bookingFormHasChanges({ ...emptyBookingForm(), date_range: { from: new Date() } })).toBe(true);
    expect(bookingFormHasChanges({ ...emptyBookingForm(), date_range: { to: new Date() } })).toBe(true);
    expect(bookingFormHasChanges({ ...emptyBookingForm(), recurring_billing: true })).toBe(true);
  });
});
