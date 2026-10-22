import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Only data-access hooks are replaced. Period projection, selection, quote
// charge validation, line calculation, totals and payload builder remain real.
const data = vi.hoisted(() => {
  const bookingId = "0a9e4ae1-3cb2-4f1a-9957-d7a57ae1cd7e";
  const quoteId = "11111111-1111-4111-8111-111111111111";
  const forklift = { id: "unit", name: "QA rental", daily_rate: 100, weekly_rate: 700, monthly_rate: 3000 };
  const booking = { id: bookingId, booking_number: "RSV0030", forklift_id: forklift.id,
    customer_id: "qa", customer_name: "QA", quote_id: quoteId, quote_rental_line_index: 0,
    status: "completed", return_status: "returned", recurring_billing: true, last_billed_date: null,
    start_date: "2026-07-15", end_date: "2026-09-30", daily_rate: 100, weekly_rate: 700,
    monthly_rate: 3000, currency: "MXN", tipo_cambio: 1, forklifts: forklift };
  const quote = { id: quoteId, quote_number: "COT0023", quote_type: "rental", customer_id: "qa",
    start_date: booking.start_date, end_date: booking.end_date,
    line_items: [
      { description: "QA monthly rent", quantity: 2, unit_price: 3000, total: 6000, line_kind: "rental" },
      { description: "QA daily rent", quantity: 16, unit_price: 100, total: 1600, line_kind: "rental" },
    ], rental_meta: [{ modelId: "qa", quantity: 1, dailyRate: 100, weeklyRate: 700, monthlyRate: 3000, discount: 0 }] };
  const charges = { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] };
  return { booking, bookings: [booking], forklifts: [forklift], quotes: [quote],
    customers: [{ id: "qa", name: "QA", rfc: "XAXX010101000" }],
    returns: [{ booking_id: bookingId, forklift_id: forklift.id, inspected_at: "2026-10-10T18:00:00Z" }],
    empty: [], charges, refetch: vi.fn(), load: vi.fn().mockResolvedValue(charges), mutate: vi.fn() };
});
vi.mock("@/features/bookings", () => ({
  useBookings: () => ({ data: data.bookings, refetch: data.refetch }),
  useBookingExtension: () => ({ data: undefined }),
}));
vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: data.customers }) }));
vi.mock("@/features/fleet", () => ({
  useForklifts: () => ({ data: data.forklifts }), useQuoteAssignments: () => ({ data: data.empty }),
}));
vi.mock("@/features/quotes", async () => ({
  ...await vi.importActual<typeof import("@/features/quotes")>("@/features/quotes"),
  useQuote: () => ({ data: undefined }), useQuotesByIds: () => ({ data: data.quotes }),
  useQuoteSaleAssignmentStatus: () => ({ isComplete: true, totalAssigned: 0, totalRequired: 0, missingByLine: data.empty }),
  useUpdateQuote: () => ({ mutate: data.mutate, isPending: false }),
}));
vi.mock("../invoices/useInvoices", () => ({
  useInvoice: () => ({ data: undefined, isLoading: false }),
  useSaveInvoiceWithBookings: () => ({ mutate: data.mutate, isPending: false }),
}));
vi.mock("../invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: data.empty, refetch: data.refetch }) }));
vi.mock("../invoices/useBookingBillingEvidence", () => ({ useBookingBillingEvidence: () => ({
  claims: { data: data.empty, isSuccess: true, isError: false, refetch: data.refetch },
  returns: { data: data.returns, isSuccess: true, isError: false, refetch: data.refetch },
  extensions: { data: data.empty, isSuccess: true, isError: false, refetch: data.refetch },
}) }));
vi.mock("../invoices/useQuoteChargeAvailability", () => ({ useQuoteChargeAvailability: () => ({
  data: data.charges, isError: false, isFetching: false, loadForQuotes: data.load, refetch: data.refetch,
}) }));

import { useInvoiceFormLogic } from "../useInvoiceFormLogic";

describe("returned quote-backed monthly booking through the invoice form", () => {
  it("carries raw booking evidence through real hooks into July rent, VAT and save payload", async () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(data.booking).not.toHaveProperty("pending_billing_period");
    expect(result.current.availableBookings?.[0]).toMatchObject({
      pending_billing_period: { start: "2026-07-15", end: "2026-07-31" },
    });
    await act(async () => { await result.current.handleBookingsChange([data.booking.id]); });
    expect(result.current.chargeBlock).toBeNull();
    const values = result.current.form.getValues();
    expect(values.billingPeriodStart).toBe("2026-07-15");
    expect(values.billingPeriodEnd).toBe("2026-07-31");
    expect(values.lineItems).toHaveLength(1);
    expect(values.lineItems[0]).toMatchObject({ line_kind: "rental", quantity: 1, unit_price: 1645.16, total: 1645.16 });
    expect(result.current.chargeBlock).toBeNull();
    expect(result.current.validateSelection(values)).toBeNull();
    expect(result.current.subtotal).toBe(1645.16);
    expect(result.current.taxAmount).toBe(263.23);
    expect(result.current.total).toBe(1908.39);
    expect(result.current.onSubmit(values)).toMatchObject({
      billing_period_start: "2026-07-15", billing_period_end: "2026-07-31",
      subtotal: 1645.16, tax_amount: 263.23, total: 1908.39,
    });
    expect(data.mutate).not.toHaveBeenCalled();
    expect(data.booking.end_date).toBe("2026-09-30");
  });
});
