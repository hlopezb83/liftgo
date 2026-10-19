import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ bookings: [] as unknown[], claims: [] as unknown[], extensions: [] as unknown[], existing: null as unknown,
  rows: [] as unknown[], ready: true, error: false, handler: vi.fn(), refetch: vi.fn() }));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: state.bookings, refetch: state.refetch }) }));
vi.mock("@/features/customers", () => ({ useCustomers: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({ useForklifts: () => ({ data: [] }), useQuoteAssignments: () => ({ data: [] }) }));
vi.mock("@/features/quotes", () => ({ useQuote: () => ({ data: undefined }), useQuotesByIds: () => ({ data: [] }), useQuoteSaleAssignmentStatus: () => ({ isComplete: true }) }));
vi.mock("@/hooks/useInitialRecordVersion", () => ({ useInitialRecordVersion: () => 1 }));
vi.mock("../invoices/useInvoices", () => ({ useInvoice: () => ({ data: state.existing }) }));
vi.mock("../invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: state.rows, refetch: state.refetch }) }));
vi.mock("../invoices/useBookingBillingEvidence", () => ({ useBookingBillingEvidence: () => ({
  claims: { data: state.claims, isSuccess: state.ready, isError: state.error, refetch: state.refetch },
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

const booking = { id: "b1", status: "confirmed", start_date: "2026-10-23", end_date: "2026-10-26", currency: "USD", tipo_cambio: 17.5 };
const extension = { booking_id: "b1", original_end_date: "2026-10-24", new_end_date: "2026-10-26", pending_invoice_id: "extension-invoice" };
const claim = { invoice_id: "extension-invoice", booking_id: "b1", status: "draft", billing_period_start: "2026-10-25", billing_period_end: "2026-10-26" };
const values = () => ({ ...buildEmptyInvoiceValues(), bookingIds: ["b1"], billingPeriodStart: "2026-10-23", billingPeriodEnd: "2026-10-24" });
beforeEach(() => {
  state.bookings = [booking]; state.extensions = [extension]; state.claims = [claim]; state.existing = null; state.rows = [];
  state.ready = true; state.error = false; state.handler.mockClear(); state.refetch.mockClear();
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
