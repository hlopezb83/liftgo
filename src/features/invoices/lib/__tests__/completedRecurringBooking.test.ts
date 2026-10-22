import type { BillableBooking } from "../bookingCompatibility";
import { describe, expect, it } from "vitest";
import { completedRecurringBooking } from "../completedRecurringBooking";
const booking: BillableBooking & { forklift_id: string } = { id: "b1", forklift_id: "f1", status: "completed", recurring_billing: true, start_date: "2026-07-15", end_date: "2026-09-30" };
const returned = { booking_id: "b1", forklift_id: "f1", inspected_at: "2026-08-10T18:00:00Z" };
const now = new Date("2026-10-21T18:00:00Z");
const claim = { booking_id: "b1", invoice_id: "i1", status: "paid", line_items: [{ line_kind: "rental" }], billing_period_start: "2026-07-15", billing_period_end: "2026-07-31" };
describe("completed recurring return cutoff", () => {
  it("cuts the final pending cycle to actual return, without changing operational dates", () => {
    expect(completedRecurringBooking(booking, [claim], [returned], now)).toEqual({ booking: { ...booking, pending_billing_period: { start: "2026-08-01", end: "2026-08-10" } }, error: null });
  });
  it("uses Monterrey date, not UTC date", () => {
    expect(completedRecurringBooking(booking, [claim], [{ ...returned, inspected_at: "2026-08-11T05:59:00Z" }], now).booking?.pending_billing_period?.end).toBe("2026-08-10");
  });
  it.each([[], [returned, returned], [{ ...returned, forklift_id: "other" }], [{ ...returned, inspected_at: "invalid" }], [{ ...returned, inspected_at: "2026-11-01T12:00:00Z" }], [{ ...returned, inspected_at: "2026-07-01T12:00:00Z" }]].map((returns) => [returns]))("fails closed for missing or inconsistent return evidence %j", (returns) => {
    const result = completedRecurringBooking(booking, [], returns, now);
    expect(result.booking).toBeNull(); expect(result.error).toMatch(/devolución/);
  });
  it("never borrows another unit's latest return", () => {
    const other = { ...returned, booking_id: "b2", forklift_id: "f2", inspected_at: "2026-09-10T18:00:00Z" };
    expect(completedRecurringBooking(booking, [claim], [returned, other], now).booking?.pending_billing_period?.end).toBe("2026-08-10");
  });
  it("leaves already issued coverage untouched and does not offer a duplicate", () => {
    expect(completedRecurringBooking(booking, [claim, { ...claim, billing_period_start: "2026-08-01", billing_period_end: "2026-08-31" }], [returned], now)).toEqual({ booking: null, error: null });
  });
  it("leaves confirmed booking behavior unchanged", () => {
    const active = { ...booking, status: "confirmed" };
    expect(completedRecurringBooking(active, [], [], now)).toEqual({ booking: active, error: null });
  });
  it("includes late days at the approved recurring rate after the contractual end", () => {
    const claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-09-30" }];
    expect(completedRecurringBooking(booking, claims, [{ ...returned, inspected_at: "2026-10-10T18:00:00Z" }], now).booking?.pending_billing_period).toEqual({ start: "2026-10-01", end: "2026-10-10" });
  });
});

describe("late-return legacy charge reconciliation", () => {
  const late = { ...returned, inspected_at: "2026-10-10T18:00:00Z" };
  const covered = { ...claim, billing_period_end: "2026-09-30" };
  it.each([undefined, [], [{ description: "Renta" }], [{ line_kind: "charge", quote_charge_key: "unverified" }]].map((lines) => [lines]))("requires reconciliation for ambiguous lines %j", (line_items) => {
    const result = completedRecurringBooking(booking, [{ ...covered, line_items }], [late], now);
    expect(result.booking).toBeNull(); expect(result.error).toMatch(/no se consideran pagados/);
  });
  it("does not block remaining contractual rental because late charges are ambiguous", () => {
    const result = completedRecurringBooking(booking, [{ ...claim, line_items: undefined }], [late], now);
    expect(result.booking?.pending_billing_period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(result.error).toBeNull();
  });
  it("does not infer attribution for grouped invoices", () => {
    const result = completedRecurringBooking(booking, [covered, { ...covered, booking_id: "b2" }], [late], now);
    expect(result.error).toMatch(/atribución/);
  });
  it("ignores cancelled ambiguous charges", () => {
    const result = completedRecurringBooking(booking, [covered, { ...covered, invoice_id: "old", status: "cancelled", line_items: undefined }], [late], now);
    expect(result.booking?.pending_billing_period).toEqual({ start: "2026-10-01", end: "2026-10-10" });
  });
});
