import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInvoiceBookingPeriods } from "../useInvoiceBookingPeriods";
import type { ReturnBillingEvidence } from "../../../lib/completedRecurringBooking";
import type { BookingInvoiceClaim } from "../../../lib/originalBookingPeriod";
import { bookingPeriodSelectionError } from "../../../lib/originalBookingPeriod";
import { periodOutsideBookingsError } from "../../../lib/bookingCompatibility";

const returned = vi.hoisted(() => ({
  booking_id: "b1", forklift_id: "f1", inspected_at: "2026-09-21T19:00:00Z",
}));
const history = vi.hoisted(() => ({ claims: [] as BookingInvoiceClaim[] }));

vi.mock("../../useBookingBillingEvidence", () => {
  const success = { isSuccess: true, isError: false, isFetching: false, refetch: vi.fn() };
  const extensions = { ...success, data: [] };
  const returns = { ...success, data: [returned] satisfies ReturnBillingEvidence[] };
  return { useBookingBillingEvidence: () => ({ claims: { ...success, data: history.claims }, extensions, returns }) };
});

beforeEach(() => { history.claims = []; });
afterEach(() => vi.useRealTimers());

it("reuses booking periods until evidence or return validity changes", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  const booking = { id: "b1", forklift_id: "f1", status: "completed", recurring_billing: true,
    start_date: "2026-09-01", end_date: "2026-09-20" };
  const options = { bookings: [booking], isEdit: false, extensionId: null, existing: null, existingBookingIds: [] };
  const { result, rerender } = renderHook(useInvoiceBookingPeriods, { initialProps: options });
  const initial = result.current.billingBookings;
  expect(initial).toEqual([]);
  expect(result.current.linkedBlock([booking.id])).toMatch(/devolución/);

  rerender({ ...options });
  expect(result.current.billingBookings).toBe(initial);

  vi.setSystemTime(new Date("2026-09-21T20:00:00Z"));
  rerender({ ...options });
  expect(result.current.billingBookings).toEqual([{
    ...booking, pending_billing_period: { start: "2026-09-01", end: "2026-09-21" },
  }]);
  expect(result.current.linkedBlock([booking.id])).toBeNull();
});

const active = { id: "b1", forklift_id: "f1", booking_number: "RES-046", status: "confirmed", recurring_billing: true,
  monthly_rate: 27000, start_date: "2026-09-11", end_date: "2027-01-10" };
const activeOptions = { bookings: [active], isEdit: false, extensionId: null, existing: null, existingBookingIds: [] };
const billed: BookingInvoiceClaim = { booking_id: "b1", invoice_id: "FAC-0139", status: "paid",
  billing_period_start: "2026-09-11", billing_period_end: "2026-11-10" };

it("makes reservation 046 available for November 11 to December 10 despite its prior invoice", () => {
  history.claims = [billed];
  const { result } = renderHook(() => useInvoiceBookingPeriods(activeOptions));
  const projected = result.current.candidates?.[0];
  expect(projected).toMatchObject({ ...active, pending_billing_cycle: "anniversary",
    pending_billing_period: { start: "2026-11-11", end: "2026-12-10" } });
  expect(result.current.unavailableIds.has("b1")).toBe(false);
  expect(result.current.linkedBlock(["b1"])).toBeNull();
  expect(active.start_date).toBe("2026-09-11");
  if (!projected) throw new Error("Expected projected active reservation");
  expect(bookingPeriodSelectionError(["b1"], [projected], history.claims, "2026-11-11", "2026-12-10", null)).toBeNull();
  expect(bookingPeriodSelectionError(["b1"], [projected], [...history.claims, { ...billed, invoice_id: "new", billing_period_start: "2026-11-11", billing_period_end: "2026-12-10" }], "2026-11-11", "2026-12-10", null)).not.toBeNull();
  expect(periodOutsideBookingsError([projected], "2026-11-11", "2027-01-11")).not.toBeNull();
});

it("keeps the existing first calendar cycle for reservations without invoice history", () => {
  const { result } = renderHook(() => useInvoiceBookingPeriods(activeOptions));
  expect(result.current.candidates).toEqual([active]);
  expect(result.current.unavailableIds.size).toBe(0);
});

it("leaves linked historical periods alone during editing and extension prefill", () => {
  history.claims = [billed];
  const { result } = renderHook(() => useInvoiceBookingPeriods({ ...activeOptions, isEdit: true, id: "FAC-0139", existingBookingIds: ["b1"] }));
  expect(result.current.billingBookings).toEqual([active]);
  expect(result.current.unavailableIds.size).toBe(0);
  const extension = renderHook(() => useInvoiceBookingPeriods({ ...activeOptions, extensionId: "extension-1" }));
  expect(extension.result.current.billingBookings).toEqual([active]);
});

it("fails closed for missing historical dates instead of making the reservation selectable", () => {
  history.claims = [{ ...billed, billing_period_end: null }];
  const { result } = renderHook(() => useInvoiceBookingPeriods(activeOptions));
  expect(result.current.candidates).toEqual([]);
  expect(result.current.linkedBlock(["b1"])).toBeTruthy();
});
