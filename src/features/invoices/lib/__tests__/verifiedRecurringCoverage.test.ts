import type { BillableBooking } from "../bookingCompatibility";
import { describe, expect, it } from "vitest";
import { verifiedRecurringCoverage } from "../verifiedRecurringCoverage";
import { completedRecurringBooking } from "../completedRecurringBooking";
import { buildLinesForBooking } from "../../hooks/invoiceForm/useInvoiceFormHandlers";
import type { Forklift } from "@/features/fleet";
const booking: BillableBooking & { forklift_id: string } = { id: "b1", forklift_id: "f1", start_date: "2026-09-01", end_date: "2026-09-20", status: "completed", recurring_billing: true, monthly_rate: 10000, currency: "MXN" };
const claim = { invoice_id: "i1", booking_id: "b1", status: "paid", billing_period_start: "2026-09-01", billing_period_end: "2026-09-20", moneda: "MXN", line_items: [{ line_kind: "rental", quantity: 1, unit_price: 6666.67, total: 6666.67 }] };
const returned = [{ booking_id: "b1", forklift_id: "f1", inspected_at: "2026-09-25T18:00:00Z" }];
const now = new Date("2026-10-21T18:00:00Z");
const historical = (start: string, end: string, amount: number) => ({ ...claim, invoice_id: start, billing_period_start: start, billing_period_end: end, line_items: [{ ...claim.line_items[0], total: amount, unit_price: amount }] });
describe("verified partial recurring coverage", () => {
  it("recovers September21–25 after20 days billed, preserving historical amounts", () => {
    const snapshot = JSON.stringify(claim);
    const recovered = completedRecurringBooking(booking, [claim], returned, now);
    expect(recovered.booking?.pending_billing_period).toEqual({ start: "2026-09-21", end: "2026-09-25" });
    if (!recovered.booking) throw new Error("Expected pending booking");
    const lines = buildLinesForBooking(recovered.booking, [{ id: "f1", name: "QA", monthly_rate: 10000 } as Forklift]);
    expect(lines[0].total).toBe(1666.67);
    // Per-document rounding may differ a cent from the aggregate25-day amount.
    expect(claim.line_items[0].total + lines[0].total).toBe(8333.34);
    expect(JSON.stringify(claim)).toBe(snapshot);
  });
  it("accepts daily6-decimal price only when both totals reconcile", () => {
    const daily = { ...claim, line_items: [{ line_kind: "rental", quantity: 20, unit_price: 333.333333, total: 6666.67 }] };
    expect(verifiedRecurringCoverage(booking, daily, [daily], 10000)).toBe(true);
  });
  it.each([
    { monthly: 11000, line: claim.line_items[0] },
    { monthly: undefined, line: claim.line_items[0] },
    { monthly: 10000, line: { ...claim.line_items[0], total: 6666.66 } },
    { monthly: 10000, line: { ...claim.line_items[0], unit_price: 6666.66 } },
    { monthly: 10000, line: { ...claim.line_items[0], discount: 1 } },
    { monthly: 10000, line: { ...claim.line_items[0], line_kind: undefined } },
  ])("rejects ambiguous rate, amount or discount %j", ({ monthly, line }) => {
    const invoice = { ...claim, line_items: [line] };
    expect(verifiedRecurringCoverage(booking, invoice, [invoice], monthly)).toBe(false);
  });
  it("rejects grouped, multi-line, cross-month and other currency histories", () => {
    expect(verifiedRecurringCoverage(booking, claim, [claim, { ...claim, booking_id: "b2" }], 10000)).toBe(false);
    expect(verifiedRecurringCoverage(booking, { ...claim, line_items: [...claim.line_items, ...claim.line_items] }, [claim], 10000)).toBe(false);
    expect(verifiedRecurringCoverage(booking, { ...claim, billing_period_start: "2026-08-01" }, [claim], 10000)).toBe(false);
    expect(verifiedRecurringCoverage(booking, { ...claim, moneda: "USD" }, [claim], 10000)).toBe(false);
  });
  it("fills the internal gap first, then the remaining tail, without duplicates", () => {
    const claims = [historical("2026-09-01", "2026-09-05", 1666.67), historical("2026-09-15", "2026-09-20", 2000)];
    expect(completedRecurringBooking(booking, claims, returned, now).booking?.pending_billing_period).toEqual({ start: "2026-09-06", end: "2026-09-14" });
    claims.push(historical("2026-09-06", "2026-09-14", 3000));
    expect(completedRecurringBooking(booking, claims, returned, now).booking?.pending_billing_period).toEqual({ start: "2026-09-21", end: "2026-09-25" });
    claims.push(historical("2026-09-21", "2026-09-25", 1666.67));
    expect(completedRecurringBooking(booking, claims, returned, now)).toEqual({ booking: null, error: null });
  });
});
