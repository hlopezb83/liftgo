import { periodOutsideBookingsError, lateRecoverySelectionError } from "../bookingCompatibility";
import { describe, expect, it } from "vitest";
import { bookingPeriodSelectionError, originalPeriodUnavailable } from "../originalBookingPeriod";
import { bookingIncompatibilityReason, prefillBillingPeriod } from "../bookingCompatibility";
import { pendingRecurringPeriod } from "../pendingRecurringPeriod";
import type { BookingInvoiceClaim } from "../originalBookingPeriod";
const booking = { id: "b1", start_date: "2026-07-15", end_date: "2026-10-31", recurring_billing: true };
const claim = (start: string | null, end: string | null, status = "draft"): BookingInvoiceClaim => ({
  booking_id: "b1", invoice_id: `${start}-${end}`, status, billing_period_start: start, billing_period_end: end,
});
describe("pending recurring periods", () => {
  it("advances after the first claimed cycle instead of hiding all remaining months", () => {
    expect(pendingRecurringPeriod(booking, [claim("2026-07-15", "2026-07-31")], "2026-10-10"))
      .toEqual({ period: { start: "2026-08-01", end: "2026-08-31" }, error: null });
  });
  it("recovers an earlier cancelled cycle despite later active invoices", () => {
    expect(pendingRecurringPeriod(booking, [claim("2026-07-15", "2026-07-31", "cancelled"), claim("2026-08-01", "2026-08-31", "paid")], "2026-10-10").period)
      .toEqual({ start: "2026-07-15", end: "2026-07-31" });
  });
  it("caps the final cycle at the explicit billable cutoff and disappears only once fully covered", () => {
    const claims = [claim("2026-07-15", "2026-09-30")];
    expect(pendingRecurringPeriod(booking, claims, "2026-10-10").period).toEqual({ start: "2026-10-01", end: "2026-10-10" });
    expect(pendingRecurringPeriod(booking, [...claims, claim("2026-10-01", "2026-10-10")], "2026-10-10")).toEqual({ period: null, error: null });
  });
  it("does not let another booking's claim consume a cycle", () => {
    expect(pendingRecurringPeriod(booking, [{ ...claim("2026-07-15", "2026-10-31"), booking_id: "other" }], "2026-10-10").period?.start).toBe("2026-07-15");
  });
  it.each([[null, null], ["2026-07-32", "2026-08-31"], ["2026-09-01", "2026-08-31"]])("fails closed for malformed active claims %s / %s", (start, end) => {
    expect(pendingRecurringPeriod(booking, [claim(start, end)], "2026-10-10").error).toBeTruthy();
  });
  it("does not guess around a partially billed monthly cycle", () => {
    expect(pendingRecurringPeriod(booking, [claim("2026-07-15", "2026-07-20")], "2026-10-10").error).toMatch(/parcial/);
  });
  it("handles leap February and adjacent cycles without a duplicate boundary day", () => {
    expect(pendingRecurringPeriod({ ...booking, start_date: "2024-01-31", end_date: "2024-04-30" }, [claim("2024-01-31", "2024-01-31")], "2024-03-04").period)
      .toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("claim lifecycle and coverage", () => {
  it.each(["draft", "sent", "paid", "cancellation_pending", "cancellation_requested"])("%s reserves its complete cycle", (status) => {
    expect(pendingRecurringPeriod(booking, [claim("2026-07-15", "2026-07-31", status)], "2026-10-10").period?.start).toBe("2026-08-01");
  });
  it("deduplicates the effect of direct and pivot evidence", () => {
    const first = claim("2026-07-15", "2026-07-31");
    expect(pendingRecurringPeriod(booking, [first, first], "2026-10-10").period?.start).toBe("2026-08-01");
  });
  it("does not skip an earlier gap to reach the maximum claimed end", () => {
    expect(pendingRecurringPeriod(booking, [claim("2026-08-01", "2026-09-30")], "2026-10-10").period?.start).toBe("2026-07-15");
  });
  it("accepts adjacent historical fragments only when they cover the entire cycle", () => {
    expect(pendingRecurringPeriod(booking, [claim("2026-07-15", "2026-07-20"), claim("2026-07-21", "2026-07-31")], "2026-10-10").period?.start).toBe("2026-08-01");
  });
  it("does not mutate claims or booking when advancing three cycles", () => {
    const original = { ...booking };
    const claims: BookingInvoiceClaim[] = [];
    for (const [start, end] of [["2026-07-15", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"]]) {
      expect(pendingRecurringPeriod(booking, claims, "2026-10-10").period).toEqual({ start, end });
      claims.push(claim(start, end));
    }
    expect(booking).toEqual(original);
    expect(pendingRecurringPeriod(booking, claims, "2026-10-10").period).toEqual({ start: "2026-10-01", end: "2026-10-10" });
  });
});


describe("pending cycle selection safety", () => {
  const derived = { ...booking, status: "completed", pending_billing_period: { start: "2026-08-01", end: "2026-08-31" } };
  it("prefills and groups by pending cycle, not original operational dates", () => {
    expect(prefillBillingPeriod(derived, new Date(2026, 9, 21))).toEqual(derived.pending_billing_period);
    expect(bookingIncompatibilityReason(derived, { ...derived, id: "b2", pending_billing_period: { start: "2026-09-01", end: "2026-09-30" } }, new Date())).toMatch(/periodo/);
    expect(bookingIncompatibilityReason(derived, { ...derived, id: "b2", start_date: "2026-06-01" }, new Date())).toBeNull();
  });
  it("keeps later unclaimed cycle available but checks overlaps again at submit", () => {
    const claims = [claim("2026-07-15", "2026-07-31")];
    expect(originalPeriodUnavailable(derived, claims)).toBe(false);
    expect(bookingPeriodSelectionError(["b1"], [derived], claims, "2026-08-01", "2026-08-31", null)).toBeNull();
    expect(bookingPeriodSelectionError(["b1"], [derived], [...claims, claim("2026-08-15", "2026-08-20")], "2026-08-01", "2026-08-31", null)?.message).toMatch(/superpone/);
  });
  it("rejects manually changed dates even when they remain inside the booking", () => {
    expect(bookingPeriodSelectionError(["b1"], [derived], [], "2026-08-01", "2026-08-20", null)?.message).toMatch(/Conserva/);
  });
  it("does not force a new cycle while editing its own historical invoice", () => {
    expect(bookingPeriodSelectionError(["b1"], [derived], [claim("2026-08-01", "2026-08-31")], "2026-08-01", "2026-08-31", null, "2026-08-01-2026-08-31")).toBeNull();
  });
});

describe("late recovery range and attribution", () => {
  it("allows verified late cycle, but never extends an ordinary booking", () => {
    const booking = { id: "late", start_date: "2026-07-15", end_date: "2026-09-30" };
    expect(periodOutsideBookingsError([booking], "2026-10-01", "2026-10-10")).toBeTruthy();
    expect(periodOutsideBookingsError([{ ...booking, pending_billing_period: { start: "2026-10-01", end: "2026-10-10" } }], "2026-10-01", "2026-10-10")).toBeNull();
  });
  it("requires a single unit and rental-only lines only for late recovery", () => {
    const late = { id: "late", start_date: "2026-07-15", end_date: "2026-09-30", pending_billing_period: { start: "2026-10-01", end: "2026-10-10" } };
    expect(lateRecoverySelectionError([late], [{ line_kind: "rental" }])).toBeNull();
    expect(lateRecoverySelectionError([late], [{ line_kind: "charge" }])).toMatch(/adicionales/);
    expect(lateRecoverySelectionError([late], [{}])).toBeTruthy();
    expect(lateRecoverySelectionError([late, { ...late, id: "other" }], [{ line_kind: "rental" }])).toMatch(/separado/);
    expect(bookingIncompatibilityReason(late, { ...late, id: "other" }, new Date())).toMatch(/separado/);
    const contractual = { ...late, pending_billing_period: { start: "2026-08-01", end: "2026-08-31" } };
    expect(lateRecoverySelectionError([contractual], [{ line_kind: "charge" }])).toBeNull();
  });
});
