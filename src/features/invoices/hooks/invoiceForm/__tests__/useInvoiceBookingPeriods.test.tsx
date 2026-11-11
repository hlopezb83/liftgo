import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInvoiceBookingPeriods } from "../useInvoiceBookingPeriods";
import type { ReturnBillingEvidence } from "../../../lib/completedRecurringBooking";

const returned = vi.hoisted(() => ({
  booking_id: "b1", forklift_id: "f1", inspected_at: "2026-09-21T19:00:00Z",
}));

vi.mock("../../invoices/useBookingBillingEvidence", () => {
  const success = { isSuccess: true, isError: false, isFetching: false, refetch: vi.fn() };
  const claims = { ...success, data: [] };
  const extensions = { ...success, data: [] };
  const returns = { ...success, data: [returned] satisfies ReturnBillingEvidence[] };
  return { useBookingBillingEvidence: () => ({ claims, extensions, returns }) };
});

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
