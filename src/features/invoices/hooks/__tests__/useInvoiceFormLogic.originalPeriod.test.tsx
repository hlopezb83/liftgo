import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ bookings: [] as unknown[], claims: [] as unknown[], extensions: [] as unknown[], returns: [] as unknown[], existing: null as unknown,
  rows: [] as unknown[], returnReady: true, ready: true, error: false, handler: vi.fn(), refetch: vi.fn() }));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: state.bookings, refetch: state.refetch }) }));
vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({ useForklifts: () => ({ data: [] }), useQuoteAssignments: () => ({ data: [] }) }));
vi.mock("@/features/quotes", () => ({ useQuote: () => ({ data: undefined }), useQuotesByIds: () => ({ data: [] }), useQuoteSaleAssignmentStatus: () => ({ isComplete: true }) }));
vi.mock("@/hooks/useInitialRecordVersion", () => ({ useInitialRecordVersion: () => 1 }));
vi.mock("../invoices/useInvoices", () => ({ useInvoice: () => ({ data: state.existing }) }));
vi.mock("../invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: state.rows, refetch: state.refetch }) }));
vi.mock("../invoices/useBookingBillingEvidence", () => ({ useBookingBillingEvidence: () => ({
  claims: { data: state.claims, isSuccess: state.ready, isError: state.error, refetch: state.refetch },
  returns: { data: state.returns, isSuccess: state.returnReady && state.ready, isError: state.error, refetch: state.refetch },
  extensions: { data: state.extensions, isSuccess: state.ready, isError: state.error, refetch: state.refetch },
}) }));
vi.mock("../invoiceForm/useInvoiceFormHandlers", () => ({ useInvoiceFormHandlers: (props: unknown) => {
  state.handler(props); return { handleCustomerSelect: vi.fn(), isLoadingCharges: false, chargeSelectionError: null };
} }));
vi.mock("../invoiceForm/useInvoiceFormSubmit", () => ({ useInvoiceFormSubmit: () => ({ buildPayload: vi.fn() }) }));
vi.mock("../invoiceForm/useInvoicePrefill", () => ({ useInvoicePrefill: () => ({ quoteChargePrefillError: null }) }));
vi.mock("../invoiceForm/useInvoiceFormTotals", () => ({ useInvoiceFormTotals: () => ({ subtotal: 0, taxAmount: 0, total: 0 }) }));
vi.mock("../invoiceForm/useInvoiceQuoteCharges", () => ({
  useInvoiceQuoteCharges: () => ({ relatedQuoteIds: [], chargeAvailability: { data: undefined, isError: false }, bookingSourceBlock: null, chargeAvailabilityError: null }),
  invoiceChargeBlock: () => null,
}));
vi.mock("../useExtensionPrefill", () => ({ useExtensionPrefill: () => ({ extension: null }) }));
import { useInvoiceFormLogic } from "../useInvoiceFormLogic";
import { buildEmptyInvoiceValues } from "../../lib/invoiceFormSchema";

const booking = { id: "b1", forklift_id: "f1", status: "confirmed", start_date: "2026-10-23", end_date: "2026-10-26", currency: "USD", tipo_cambio: 17.5 };
const extension = { booking_id: "b1", original_end_date: "2026-10-24", new_end_date: "2026-10-26", pending_invoice_id: "extension-invoice" };
const claim = { invoice_id: "extension-invoice", booking_id: "b1", status: "draft", billing_period_start: "2026-10-25", billing_period_end: "2026-10-26" };
const values = () => ({ ...buildEmptyInvoiceValues(), bookingIds: ["b1"], billingPeriodStart: "2026-10-23", billingPeriodEnd: "2026-10-24" });
beforeEach(() => {
  state.bookings = [booking]; state.extensions = [extension]; state.claims = [claim]; state.existing = null; state.rows = [];
  state.returns = [{ booking_id: "b1", forklift_id: "f1", inspected_at: "2026-09-30T18:00:00Z" }];
  state.returnReady = true; state.ready = true; state.error = false; state.handler.mockClear(); state.refetch.mockClear();
});

describe("original period form wiring", () => {
  it.each(["draft", "sent", "paid", "cancelled"])("shows original term after extension %s and passes it to line prefill", (status) => {
    state.claims = [{ ...claim, status }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([{ ...booking, end_date: "2026-10-24" }]);
    expect(state.handler.mock.lastCall?.[0].bookings[0].end_date).toBe("2026-10-24");
    expect(result.current.validateSelection(values())).toBeNull();
  });
  it("hides the saved original but keeps it visible while editing itself beside the extension", () => {
    const initial = { ...claim, invoice_id: "initial", billing_period_start: "2026-10-23", billing_period_end: "2026-10-24" };
    state.claims = [claim, initial];
    const created = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(created.result.current.availableBookings).toEqual([]);
    state.existing = { id: "initial", booking_id: "b1", billing_period_start: "2026-10-23", billing_period_end: "2026-10-24" };
    const edited = renderHook(() => useInvoiceFormLogic({ id: "initial", fromQuoteId: null }));
    expect(edited.result.current.availableBookings).toHaveLength(1);
    expect(edited.result.current.validateSelection(values())).toBeNull();
  });
  it("preserves recurring edit selector policy when another invoice exists", () => {
    state.bookings = [{ ...booking, recurring_billing: true }];
    state.existing = { id: "initial", booking_id: "b1", billing_period_start: "2026-10-23", billing_period_end: "2026-10-24" };
    const { result } = renderHook(() => useInvoiceFormLogic({ id: "initial", fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
  });
  it.each([false, true])("fails closed while evidence loading or errored=%s, without blocking manual invoices", (error) => {
    state.ready = false; state.error = error;
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.bookingAvailabilityBlock).toBeTruthy();
    expect(result.current.validateSelection(buildEmptyInvoiceValues())).toBeNull();
    expect(result.current.validateSelection(values())?.message).toMatch(/historial/);
    expect(state.handler.mock.lastCall?.[0].bookings).toBeUndefined();
  });
  it("rejects missing, malformed-history, expanded and overlapping submitted selections", () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.validateSelection({ ...values(), bookingIds: ["missing"] })?.field).toBe("bookingIds");
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: "2026-10-26" })?.message).toMatch(/superpone/);
    state.extensions = [{ ...extension, new_end_date: "2026-10-25" }];
    const malformed = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(malformed.result.current.availableBookings).toEqual([]);
    expect(malformed.result.current.bookingAvailabilityBlock).toMatch(/incompleto/);
    expect(malformed.result.current.validateSelection(values())?.field).toBe("bookingIds");
  });
});


describe("completed/returned booking billing eligibility", () => {
  beforeEach(() => {
    // QA COT0022 → RSV0029 → ENT0015 → DEV0006: return closes operations,
    // but does not create an invoice or erase the outstanding rental charge.
    state.bookings = [{ ...booking, status: "completed", return_status: "returned", booking_number: "RSV0029" }];
    state.extensions = [];
    state.claims = [];
  });

  it("offers an uninvoiced returned booking without reopening it or changing its period", () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual(state.bookings);
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: booking.end_date })).toBeNull();
    expect(state.bookings[0]).toMatchObject({ status: "completed", return_status: "returned" });
    expect(state.handler.mock.lastCall?.[0].bookings).toEqual(state.bookings);
  });

  it.each(["cancelled", "pending", "draft", "unknown"])("does not offer a %s booking", (status) => {
    state.bookings = [{ ...booking, status }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
  });

  it.each(["draft", "sent", "paid"])("blocks a returned booking already covered by a %s invoice", (status) => {
    state.claims = [{ ...claim, status, billing_period_start: booking.start_date }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.validateSelection(values())?.message).toMatch(/superpone/);
  });

  it("allows rebilling after cancellation, but still rejects an out-of-range period", () => {
    state.claims = [{ ...claim, status: "cancelled", billing_period_start: booking.start_date }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toHaveLength(1);
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: booking.end_date })).toBeNull();
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: "2026-10-27" })).not.toBeNull();
  });

  it("keeps an unbilled original term available after the returned booking's extension was invoiced", () => {
    state.extensions = [extension]; state.claims = [claim];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings?.[0]).toMatchObject({ status: "completed", end_date: extension.original_end_date });
    expect(result.current.validateSelection(values())).toBeNull();
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: booking.end_date })?.message).toMatch(/superpone/);
  });

  it("rejects inclusive boundary overlap after return", () => {
    state.claims = [{ ...claim, billing_period_start: "2026-10-24" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.validateSelection(values())?.message).toMatch(/superpone/);
  });

  it.each([false, true])("fails closed for returned bookings while evidence is unavailable (error=%s)", (error) => {
    state.ready = false; state.error = error;
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.validateSelection(values())?.message).toMatch(/historial/);
  });

  it("allows the first manual invoice of a completed recurring booking with verified return", () => {
    state.bookings = [{ ...booking, status: "completed", recurring_billing: true, start_date: "2026-07-15", end_date: "2026-09-30" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings?.[0].pending_billing_period).toEqual({ start: "2026-07-15", end: "2026-07-31" });
    expect(result.current.validateSelection({ ...values(), billingPeriodStart: "2026-07-15", billingPeriodEnd: "2026-07-31" })).toBeNull();
  });

  it("preserves recurring selector policy after return", () => {
    state.bookings = [{ ...booking, status: "completed", recurring_billing: true }];
    state.claims = [claim];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
  });

  it("keeps a completed booking available for editing its own original invoice", () => {
    state.claims = [{ ...claim, invoice_id: "initial", billing_period_start: booking.start_date }];
    state.existing = { id: "initial", booking_id: booking.id, billing_period_start: booking.start_date, billing_period_end: booking.end_date };
    const { result } = renderHook(() => useInvoiceFormLogic({ id: "initial", fromQuoteId: null }));
    expect(result.current.availableBookings).toHaveLength(1);
    expect(result.current.validateSelection({ ...values(), billingPeriodEnd: booking.end_date })).toBeNull();
  });
});

describe("obsolete VAT form wiring", () => {
  const historical = () => ({ id: "old", customer_id: "qa", customer_name: "QA", issued_at: "2013-01-01", tax_rate: 11,
    line_items: [{ description: "Historic", quantity: 1, unit_price: 100, total: 100, tax_rate: 11 }],
    subtotal: 100, tax_amount: 11, total: 111 });
  it("permits notes-only historical edits and preserves stored fiscal payload", async () => {
    const invoice = historical(); state.existing = invoice;
    const { result } = renderHook(() => useInvoiceFormLogic({ id: "old", fromQuoteId: null }));
    const { buildFromInvoice } = await import("../invoiceForm/invoiceFormBuilders");
    const edited = { ...buildFromInvoice(invoice, undefined), notes: "Reviewed" };
    const save = vi.fn();
    await act(async () => { result.current.form.reset(edited); });
    await act(async () => { await result.current.form.handleSubmit(save)(); });
    expect(save).toHaveBeenCalledOnce();
    expect(result.current.onSubmit(edited)).toMatchObject({ line_items: invoice.line_items, tax_rate: 11, subtotal: 100, tax_amount: 11, total: 111 });
  });
  it("blocks a newly created document inheriting legacy 11 before save", async () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    const { buildFromInvoice } = await import("../invoiceForm/invoiceFormBuilders");
    const inherited = buildFromInvoice(historical(), undefined);
    const save = vi.fn();
    await act(async () => { result.current.form.reset(inherited); });
    await act(async () => { await result.current.form.handleSubmit(save)(); });
    expect(save).not.toHaveBeenCalled();
    const invalid = vi.fn();
    await act(async () => { await result.current.form.handleSubmit(save, invalid)(); });
    expect(invalid.mock.calls[0][0].taxRate.message).toContain("11%");
  });
});

describe("completed recurring outstanding cycles", () => {
  it("keeps a completed recurring reservation available after July is billed", () => {
    state.extensions = [];
    state.bookings = [{ ...booking, status: "completed", recurring_billing: true, start_date: "2026-07-15", end_date: "2026-09-30" }];
    state.claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-07-31" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toHaveLength(1);
    expect(result.current.availableBookings?.[0]).toMatchObject({ start_date: "2026-07-15", end_date: "2026-09-30", pending_billing_period: { start: "2026-08-01", end: "2026-08-31" } });
  });
});


describe("completed recurring safety wiring", () => {
  const recovered = { ...booking, status: "completed", recurring_billing: true, start_date: "2026-07-15", end_date: "2026-09-30" };
  const period = (start: string, end: string) => ({ ...values(), billingPeriodStart: start, billingPeriodEnd: end });
  beforeEach(() => { state.bookings = [recovered]; state.extensions = []; state.claims = []; });
  it("advances each saved cycle until no rental period remains", () => {
    const { result, rerender } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    const periods = [["2026-07-15", "2026-07-31"], ["2026-08-01", "2026-08-31"], ["2026-09-01", "2026-09-30"]];
    for (const [start, end] of periods) {
      expect(result.current.availableBookings?.[0].pending_billing_period).toEqual({ start, end });
      expect(result.current.validateSelection(period(start, end))).toBeNull();
      state.claims.push({ ...claim, billing_period_start: start, billing_period_end: end });
      rerender();
    }
    expect(result.current.availableBookings).toEqual([]);
  });
  it("rejects edited dates and stale cycle submissions", () => {
    const { result, rerender } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.validateSelection(period("2026-07-15", "2026-07-30"))?.message).toMatch(/Conserva/);
    state.claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-07-31" }]; rerender();
    expect(result.current.validateSelection(period("2026-07-15", "2026-07-31"))?.message).toMatch(/Conserva/);
  });
  it("reports partial history specifically rather than claiming extension corruption", () => {
    state.claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-07-20" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.validateSelection(period("2026-07-15", "2026-07-31"))?.message).toMatch(/parcial/);
    expect(result.current.bookingAvailabilityBlock).toMatch(/parcial/);
  });
  it.each([false, true])("missing return (loading=%s) blocks only its booking, not unrelated invoices", (loading) => {
    state.returns = []; state.returnReady = !loading;
    state.bookings.push({ ...booking, id: "other" });
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings?.map((b) => b.id)).toEqual(["other"]);
    expect(result.current.validateSelection(period("2026-07-15", "2026-07-31"))?.message).toMatch(/devolución/);
    expect(result.current.validateSelection({ ...values(), bookingIds: ["other"] })).toBeNull();
    expect(result.current.validateSelection(buildEmptyInvoiceValues())).toBeNull();
  });
  it("leaves historical recurring edits alone even with no return evidence", () => {
    state.returns = [];
    state.existing = { id: "initial", booking_id: "b1", billing_period_start: "2026-07-15", billing_period_end: "2026-07-31" };
    state.claims = [{ ...claim, invoice_id: "initial", billing_period_start: "2026-07-15", billing_period_end: "2026-07-31" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ id: "initial", fromQuoteId: null }));
    expect(result.current.availableBookings?.[0]).not.toHaveProperty("pending_billing_period");
    expect(result.current.validateSelection(period("2026-07-15", "2026-07-31"))).toBeNull();
  });
});

describe("late recurring form recovery", () => {
  beforeEach(() => {
    state.extensions = [];
    state.bookings = [{ ...booking, status: "completed", recurring_billing: true, start_date: "2026-07-15", end_date: "2026-09-30" }];
    state.claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-09-30", line_items: [{ line_kind: "rental" }] }];
    state.returns = [{ booking_id: "b1", forklift_id: "f1", inspected_at: "2026-10-10T18:00:00Z" }];
  });
  it("offers and accepts the actual late-return period without changing the booking", () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings?.[0]).toMatchObject({ end_date: "2026-09-30", pending_billing_period: { start: "2026-10-01", end: "2026-10-10" } });
    const input = { ...values(), billingPeriodStart: "2026-10-01", billingPeriodEnd: "2026-10-10", lineItems: [{ description: "Rental", quantity: 1, unit_price: 100, total: 100, line_kind: "rental" as const }] };
    expect(result.current.validateSelection(input)).toBeNull();
    expect(result.current.validateSelection({ ...input, lineItems: [{ ...input.lineItems[0], line_kind: "charge" }] })?.message).toMatch(/adicionales/);
  });
  it("explains unresolved historical charges rather than claiming no debt", () => {
    state.claims = [{ ...claim, billing_period_start: "2026-07-15", billing_period_end: "2026-09-30" }];
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    expect(result.current.availableBookings).toEqual([]);
    expect(result.current.bookingAvailabilityBlock).toMatch(/no se consideran pagados/);
    expect(result.current.validateSelection({ ...values(), billingPeriodStart: "2026-10-01", billingPeriodEnd: "2026-10-10" })?.message).toMatch(/atribución/);
  });
});

it("recovers a verified partial late cycle through the real form, without overlap", () => {
  state.extensions = [];
  state.bookings = [{ ...booking, status: "completed", recurring_billing: true, monthly_rate: 10000, start_date: "2026-09-01", end_date: "2026-09-20" }];
  state.claims = [{ ...claim, moneda: "USD", billing_period_start: "2026-09-01", billing_period_end: "2026-09-20", line_items: [{ line_kind: "rental", quantity: 1, unit_price: 6666.67, total: 6666.67 }] }];
  state.returns = [{ booking_id: "b1", forklift_id: "f1", inspected_at: "2026-09-25T18:00:00Z" }];
  const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
  expect(result.current.availableBookings?.[0].pending_billing_period).toEqual({ start: "2026-09-21", end: "2026-09-25" });
  expect(state.handler.mock.lastCall?.[0].bookings[0].end_date).toBe("2026-09-20");
  expect(result.current.validateSelection({ ...values(), billingPeriodStart: "2026-09-21", billingPeriodEnd: "2026-09-25", lineItems: [{ description: "Rental", quantity: 1, unit_price: 1666.67, total: 1666.67, line_kind: "rental" }] })).toBeNull();
});
