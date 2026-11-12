import { act, renderHook, waitFor } from "@testing-library/react";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  return { notifyWarning: vi.fn(), saveOptions: null as { onBusinessBlock?: (block: BusinessBlock) => void } | null, extension: null as Record<string, unknown> | null, customerDetail: { data: null as Record<string, unknown> | null, isPending: false, isFetching: false, isError: false }, booking, bookings: [booking], forklifts: [forklift], quotes: [quote],
    customers: [{ id: "qa", name: "QA", rfc: "XAXX010101000" }],
    returns: [{ booking_id: bookingId, forklift_id: forklift.id, inspected_at: "2026-10-10T18:00:00Z" }],
    empty: [], charges, refetch: vi.fn(), load: vi.fn().mockResolvedValue(charges), mutate: vi.fn() };
});
vi.mock("../invoices/useInvoiceBookingCandidates", () => ({
  useInvoiceBookingCandidates: () => ({ isSuccess: true, data: data.bookings, refetch: data.refetch }),
}));
vi.mock("@/features/bookings", async () => ({
  ...await vi.importActual("@/features/bookings/lib/extensionBilling"),
  useBookingExtension: () => ({ data: data.extension, isPending: false, isFetching: false, isError: false, refetch: data.refetch }),
}));
vi.mock("@/features/customers", async () => ({
  ...await vi.importActual("@/features/customers/lib/customerTaxRate"), useCustomers: () => ({ data: data.customers }), useCustomer: () => ({ ...data.customerDetail, refetch: data.refetch }) }));
vi.mock("@/features/fleet", () => ({
  useQuoteAssignments: () => ({ data: data.empty }),
}));
vi.mock("../invoiceForm/useInvoiceRentalEquipment", async (original) => ({
  ...await original<typeof import("../invoiceForm/useInvoiceRentalEquipment")>(),
  useInvoiceRentalEquipment: () => ({ data: data.forklifts, loadForIds: async () => data.forklifts, refetch: data.refetch }),
}));
vi.mock("../invoiceForm/useInvoiceSourceCustomer", () => ({ useInvoiceSourceCustomer: () => ({
  dependencies: [], prefillCustomers: data.customers,
  loadForId: async (id: string) => data.customers.find((customer) => customer.id === id),
}) }));
vi.mock("@/features/quotes", async () => ({
  ...await vi.importActual<typeof import("@/features/quotes")>("@/features/quotes"),
  useQuote: () => ({ data: undefined }), useQuotesByIds: () => ({ data: data.quotes }),
  useQuoteSaleAssignmentStatus: () => ({ isComplete: true, totalAssigned: 0, totalRequired: 0, missingByLine: data.empty }),
  useUpdateQuote: () => ({ mutate: data.mutate, isPending: false }),
}));
vi.mock("../invoices/useInvoices", () => ({
  useInvoice: () => ({ data: undefined, isLoading: false }),
  useSaveInvoiceWithBookings: (opts: { onBusinessBlock?: (block: BusinessBlock) => void }) => {
    data.saveOptions = opts;
    return { mutate: data.mutate, isPending: false };
  },
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

vi.mock("@/lib/ui/appFeedback", () => ({ notifyWarning: data.notifyWarning }));

import { resolveBusinessBlock, describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { useInvoiceFormTotals } from "../invoiceForm/useInvoiceFormTotals";
import { useInvoiceFormLogic } from "../useInvoiceFormLogic";

describe("returned quote-backed monthly booking through the invoice form", () => {
  it("carries raw booking evidence through real hooks into July rent, VAT and save payload", async () => {
    const { result } = renderHook(() => {
      const form = useInvoiceFormLogic({ fromQuoteId: null });
      return { ...form, ...useInvoiceFormTotals(form.form) };
    });
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


afterEach(() => {
  data.notifyWarning.mockClear();
  data.saveOptions = null;
  data.extension = null;
  data.customerDetail = { data: null, isPending: false, isFetching: false, isError: false };
  data.customers = [{ id: "qa", name: "QA", rfc: "XAXX010101000" }];
});

describe("extension customer readiness through invoice form submission guards", () => {
  function setExtension() {
    data.extension = { id: "extension-1", booking_id: data.booking.id, invoice_id: null,
      original_end_date: "2026-09-30", new_end_date: "2026-10-01", bookings: data.booking };
    data.customers = [];
  }

  it.each(["pending", "error", "missing"])("blocks submission while customer detail is %s even with an empty list", (status) => {
    setExtension();
    data.customerDetail.isPending = status === "pending";
    data.customerDetail.isFetching = status === "pending";
    data.customerDetail.isError = status === "error";
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null, extensionId: "extension-1" }));
    expect(result.current.chargeBlock).toMatch(status === "pending" ? /Verificando el cliente/ : /No se pudo verificar el cliente/);
    expect(result.current.validateSelection(result.current.form.getValues())).toEqual({
      field: "lineItems", message: result.current.chargeBlock,
    });
    expect(result.current.form.getValues("lineItems")).toEqual([]);
  });

  it("uses a verified customer detail outside the list without changing invoice tax", async () => {
    setExtension();
    data.customerDetail.data = { id: "qa", name: "QA", tax_rate: 0, rfc: "XAXX010101000" };
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null, extensionId: "extension-1" }));
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(1));
    expect(result.current.form.getValues()).toMatchObject({ customerId: "qa", taxRate: 0 });
    expect(result.current.chargeBlock).toBeNull();
  });
  it.each(["customer", "booking", "bookings", "reset"])("keeps a newer %s clear/reset blocked when the deferred detail arrives", async (action) => {
    setExtension();
    data.customerDetail.isPending = true;
    const { result, rerender } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null, extensionId: "extension-1" }));
    act(() => {
      if (action === "customer") result.current.handleCustomerSelect("");
      if (action === "booking") result.current.handleBookingSelect("");
      if (action === "bookings") void result.current.handleBookingsChange([]);
      if (action === "reset") result.current.form.reset();
    });
    data.customerDetail = { data: { id: "qa", name: "QA", tax_rate: 0 }, isPending: false, isFetching: false, isError: false };
    rerender();
    await waitFor(() => expect(result.current.chargeBlock).toMatch(/Cambiaste el formulario/));
    expect(result.current.form.getValues("customerId")).toBe("");
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.validateSelection(result.current.form.getValues())).toEqual({ field: "lineItems", message: result.current.chargeBlock });
  });

});

// Real form + submit hooks must forward every business block to visible feedback.
describe("invoice save rejection feedback wiring", () => {
  it("shows the sale duplicate explanation from the actual database message", () => {
    renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    const block = resolveBusinessBlock({ code: "23505", message: "Esta cotización de venta ya tiene una factura activa. Continúa el borrador existente o revisa su cancelación antes de crear otra." });
    expect(block?.code).toBe("quote_sale_already_invoiced");
    expect(data.saveOptions?.onBusinessBlock).toBeTypeOf("function");
    act(() => data.saveOptions!.onBusinessBlock!(block!));
    expect(data.notifyWarning).toHaveBeenCalledExactlyOnceWith(block!.action, { description: `${block!.reason} ${block!.nextStep}` });
  });
  it("preserves dedicated assignment UI rather than emitting a warning", () => {
    const { result } = renderHook(() => useInvoiceFormLogic({ fromQuoteId: null }));
    const block = describeBusinessBlock("quote_sale_assignment_incomplete");
    act(() => data.saveOptions!.onBusinessBlock!(block));
    expect(data.notifyWarning).not.toHaveBeenCalled();
    expect(result.current.serverSaleAssignmentBlock).toEqual(block);
  });
});
