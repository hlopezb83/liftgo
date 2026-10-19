import { describe, expect, it } from "vitest";
import { bookingPeriodConflict, originalPeriodBooking, originalPeriodUnavailable, type BookingInvoiceClaim } from "../originalBookingPeriod";

const booking = { id: "b1", start_date: "2026-10-23", end_date: "2026-10-26", recurring_billing: false, currency: "USD", tipo_cambio: 17.5 };
const ext = { booking_id: "b1", original_end_date: "2026-10-24", new_end_date: "2026-10-26", pending_invoice_id: "extension-draft" };
const claim = (patch: Partial<BookingInvoiceClaim> = {}): BookingInvoiceClaim => ({ invoice_id: "extension-draft", booking_id: "b1", status: "draft", billing_period_start: "2026-10-25", billing_period_end: "2026-10-26", ...patch });

describe("original term and active period occupancy", () => {
  it.each(["draft", "sent", "paid", "cancelled"])("extension %s does not hide or expand the unbilled original", (status) => {
    const original = originalPeriodBooking(booking, [ext])!;
    expect(original).toEqual({ ...booking, end_date: "2026-10-24" });
    expect(originalPeriodUnavailable(original, [claim({ status })])).toBe(false);
    expect(booking.end_date).toBe("2026-10-26");
  });
  it("original first hides its period, cancellation reopens, current invoice can edit", () => {
    const original = originalPeriodBooking(booking, [ext])!;
    const initial = claim({ invoice_id: "initial", billing_period_start: "2026-10-23", billing_period_end: "2026-10-24" });
    expect(originalPeriodUnavailable(original, [claim(), initial])).toBe(true);
    expect(originalPeriodUnavailable(original, [claim(), { ...initial, status: "cancelled" }])).toBe(false);
    expect(originalPeriodUnavailable(original, [claim(), initial], "initial")).toBe(false);
  });
  it.each([
    ["2026-10-22", "2026-10-23", true], ["2026-10-24", "2026-10-25", true],
    ["2026-10-22", "2026-10-27", true], ["2026-10-25", "2026-10-26", false],
    ["2026-10-21", "2026-10-22", false], [null, null, true], ["2026-10-26", "2026-10-25", true],
  ])("checks inclusive boundaries and unknown periods %s–%s", (start, end, blocked) => {
    expect(bookingPeriodConflict("b1", "2026-10-23", "2026-10-24", [claim({ billing_period_start: start, billing_period_end: end })])).toBe(blocked);
  });
  it("keeps recurring behavior and untouched original-first bookings", () => {
    expect(originalPeriodBooking(booking, [])).toBe(booking);
    const recurring = { ...booking, recurring_billing: true };
    expect(originalPeriodBooking(recurring, [ext])).toBe(recurring);
    expect(originalPeriodUnavailable(recurring, [claim()])).toBe(true);
  });
  it("orders a continuous extension chain and does not let invoice state redefine it", () => {
    const later = { ...ext, original_end_date: "2026-10-26", new_end_date: "2026-10-29", invoice_id: "cancelled" };
    expect(originalPeriodBooking({ ...booking, end_date: "2026-10-29" }, [later, ext])?.end_date).toBe("2026-10-24");
  });
  it.each([
    [ext, ext], [{ ...ext, new_end_date: "2026-10-25" }],
    [{ ...ext, original_end_date: "2026-10-22" }], [{ ...ext, new_end_date: "2026-10-23" }],
    [ext, { ...ext, original_end_date: "2026-10-27", new_end_date: "2026-10-29" }],
  ])("fails closed for ambiguous or discontinuous history %#", (...history) => {
    expect(originalPeriodBooking(booking, history)).toBeNull();
  });
});
