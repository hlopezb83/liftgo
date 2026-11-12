import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const quotes = [
    { id: "quote-a", customer_id: "customer-502", customer_name: "Cliente A", version: 4, line_items: [], tax_rate: 16 },
    { id: "quote-b", customer_id: "customer-503", customer_name: "Cliente B", version: 6, line_items: [], tax_rate: 0 },
  ];
  const bookings = quotes.map((quote, index) => ({ id: `booking-${index}`, customer_id: quote.customer_id,
    customer_name: quote.customer_name, forklift_id: "unit", status: "confirmed", currency: "MXN",
    start_date: "2026-10-01", end_date: "2026-10-02" }));
  const empty: never[] = [];
  return { quotes, bookings, empty, readCustomer: vi.fn(), refetch: vi.fn(),
    customers: Array.from({ length: 501 }, (_, index) => ({ id: `customer-${index}`, name: `Cliente ${index}` })),
    equipment: [{ id: "unit", name: "QA rental", daily_rate: 100, weekly_rate: 700, monthly_rate: 3000 }],
    charges: { complete: true, quotes: quotes.map((quote) => ({ quote_id: quote.id, legacy_review_required: false, lines: [] })) },
  };
});

// Model the public customer query contract; no Supabase or real backend is used.
// Both the observed quote read and imperative booking read run through QueryClient.
vi.mock("@/features/customers", async () => {
  const { useQuery, queryOptions } = await import("@tanstack/react-query");
  const detail = (id: string) => queryOptions({ queryKey: ["customers", "detail", id],
    queryFn: () => state.readCustomer(id), staleTime: 60_000 });
  return { ...await vi.importActual("@/features/customers/lib/customerTaxRate"),
    useCustomers: () => ({ data: state.customers }), customerQueries: { detail },
    useCustomer: (id?: string) => useQuery({ ...detail(id ?? ""), enabled: !!id }),
  };
});
vi.mock("@/features/fleet", () => ({ useQuoteAssignments: () => ({ data: state.empty, refetch: state.refetch }) }));
vi.mock("@/features/quotes", () => ({
  useQuote: (id?: string) => ({ data: state.quotes.find((quote) => quote.id === id), refetch: state.refetch }),
  useQuotesByIds: () => ({ data: state.empty }), hasQuotedDiscount: () => false,
  useQuoteSaleAssignmentStatus: () => ({ isComplete: true }),
}));
vi.mock("../invoices/useInvoiceBookingCandidates", () => ({ useInvoiceBookingCandidates: () => ({
  data: state.bookings, isSuccess: true, isError: false, refetch: state.refetch,
}) }));
vi.mock("../invoiceForm/useInvoiceBookingPeriods", () => ({ useInvoiceBookingPeriods: () => ({
  handlerBookings: state.bookings, candidates: state.bookings, unavailableIds: new Set(), linkedBlock: () => null,
}) }));
vi.mock("../invoiceForm/useInvoiceRentalEquipment", async (original) => ({
  ...await original<typeof import("../invoiceForm/useInvoiceRentalEquipment")>(),
  useInvoiceRentalEquipment: () => ({ data: state.equipment, loadForIds: async () => state.equipment, refetch: state.refetch }),
}));
vi.mock("../invoiceForm/useInvoiceQuoteCharges", async (original) => ({
  ...await original<typeof import("../invoiceForm/useInvoiceQuoteCharges")>(),
  useInvoiceQuoteCharges: () => ({ relatedQuoteIds: state.empty, bookingSourceBlock: null, chargeAvailabilityError: null,
    chargeAvailability: { data: state.charges, loadForQuotes: async () => state.charges, refetch: state.refetch },
  }),
}));
vi.mock("../invoices/useInvoices", () => ({ useInvoice: () => ({ data: undefined }) }));
vi.mock("../invoices/useInvoiceBookings", () => ({ useInvoiceBookings: () => ({ data: state.empty }) }));
vi.mock("../invoiceForm/useInvoiceFormSubmit", () => ({ useInvoiceFormSubmit: () => ({ buildPayload: vi.fn() }) }));
vi.mock("../useExtensionPrefill", () => ({ useExtensionPrefill: () => ({ extension: null, interruptPrefill: vi.fn() }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: vi.fn(), notifyWarning: vi.fn() }));

import { useInvoiceFormLogic } from "../useInvoiceFormLogic";

const customerA = { id: "customer-502", name: "Cliente A", rfc: "XAXX010101000", razon_social: "Razón A",
  regimen_fiscal: "601", domicilio_fiscal_cp: "64000", uso_cfdi: "S01", tax_rate: 8 };
const customerB = { ...customerA, id: "customer-503", name: "Cliente B", rfc: "XEXX010101000", razon_social: "Razón B" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
function setup(fromQuoteId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderHook(({ quoteId }) => useInvoiceFormLogic({ fromQuoteId: quoteId }), {
    initialProps: { quoteId: fromQuoteId },
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => { state.readCustomer.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

it("loads the quote receiver outside the first 501 customers before fixing its fiscal snapshot", async () => {
  const customer = deferred<typeof customerA>();
  state.readCustomer.mockReturnValue(customer.promise);
  const { result } = setup("quote-a");
  expect(result.current.customers).toHaveLength(501);
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerA.id));
  expect(result.current.sourceQuoteVersion).toBeNull();
  expect(result.current.chargeBlock).toBeTruthy();
  await act(async () => { customer.resolve(customerA); });
  await waitFor(() => expect(result.current.sourceQuoteVersion).toBe(4));
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerA.id, taxRate: 16,
    cfdi: { receptorRfc: customerA.rfc, receptorRazonSocial: "Razón A", receptorRegimenFiscal: "601", receptorDomicilioFiscalCp: "64000", usoCfdi: "S01" },
  });
  expect(result.current.chargeBlock).toBeNull();
});

it("loads a booking receiver by ID rather than silently omitting fields outside the first page", async () => {
  state.readCustomer.mockResolvedValue(customerA);
  const { result } = setup();
  await act(async () => { await result.current.handleBookingsChange(["booking-0"]); });
  expect(state.readCustomer).toHaveBeenCalledWith(customerA.id);
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerA.id, bookingIds: ["booking-0"], taxRate: 8,
    cfdi: { receptorRfc: customerA.rfc, receptorRegimenFiscal: "601", receptorDomicilioFiscalCp: "64000" },
  });
});

it.each(["manual", ""])("keeps an explicit quote fiscal edit '%s' when its customer arrives late", async (value) => {
  const customer = deferred<typeof customerA>();
  state.readCustomer.mockReturnValue(customer.promise);
  const { result } = setup("quote-a");
  act(() => {
    result.current.form.setValue("cfdi.receptorRfc", "intermediate", { shouldDirty: true });
    result.current.form.setValue("cfdi.receptorRfc", value, { shouldDirty: true });
  });
  await act(async () => { customer.resolve(customerA); });
  await waitFor(() => expect(result.current.chargeBlock).toMatch(/Cambiaste el receptor/));
  expect(result.current.form.getValues("cfdi.receptorRfc")).toBe(value);
  expect(result.current.sourceQuoteVersion).toBeNull();
});

it("ignores a late customer from the prior quote after changing source", async () => {
  const first = deferred<typeof customerA>(); const second = deferred<typeof customerB>();
  state.readCustomer.mockImplementation((id: string) => id === customerA.id ? first.promise : second.promise);
  const { result, rerender } = setup("quote-a");
  rerender({ quoteId: "quote-b" });
  await act(async () => { second.resolve(customerB); });
  await waitFor(() => expect(result.current.sourceQuoteVersion).toBe(6));
  await act(async () => { first.resolve(customerA); });
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerB.id, taxRate: 0, cfdi: { receptorRfc: customerB.rfc } });
  expect(result.current.sourceQuoteVersion).toBe(6);
});

it("preserves a fiscal field cleared back to its initial value during the booking customer lookup", async () => {
  const customer = deferred<typeof customerA>(); state.readCustomer.mockReturnValue(customer.promise);
  const { result } = setup(); let selection!: Promise<void>;
  act(() => { selection = result.current.handleBookingsChange(["booking-0"]); });
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerA.id));
  act(() => {
    result.current.form.setValue("cfdi.receptorRfc", "manual", { shouldDirty: true });
    result.current.form.setValue("cfdi.receptorRfc", "", { shouldDirty: true });
  });
  await act(async () => { customer.resolve(customerA); await selection; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerA.id,
    cfdi: { receptorRfc: "", receptorRazonSocial: "Razón A" },
  });
});

it("does not reapply a booking receiver after an explicit customer choice", async () => {
  const customer = deferred<typeof customerA>(); state.readCustomer.mockReturnValue(customer.promise);
  const { result } = setup(); let selection!: Promise<void>;
  act(() => { selection = result.current.handleBookingsChange(["booking-0"]); });
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerA.id));
  act(() => result.current.handleCustomerSelect(customerB.id, customerB));
  await act(async () => { customer.resolve(customerA); await selection; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerB.id, bookingIds: [], cfdi: { receptorRfc: customerB.rfc } });
  expect(result.current.chargeBlock).toMatch(/Cambiaste el cliente/);
});

it("keeps the newer booking selection when customer lookups complete out of order", async () => {
  const first = deferred<typeof customerA>(); const second = deferred<typeof customerB>();
  state.readCustomer.mockImplementation((id: string) => id === customerA.id ? first.promise : second.promise);
  const { result } = setup(); let firstSelection!: Promise<void>; let secondSelection!: Promise<void>;
  act(() => { firstSelection = result.current.handleBookingsChange(["booking-0"]); });
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerA.id));
  act(() => { secondSelection = result.current.handleBookingsChange(["booking-1"]); });
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerB.id));
  await act(async () => { second.resolve(customerB); await secondSelection; });
  await act(async () => { first.resolve(customerA); await firstSelection; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerB.id, bookingIds: ["booking-1"], cfdi: { receptorRfc: customerB.rfc } });
});

it("does not change an unmounted form when its booking customer lookup completes", async () => {
  const customer = deferred<typeof customerA>(); state.readCustomer.mockReturnValue(customer.promise);
  const { result, unmount } = setup(); let selection!: Promise<void>;
  act(() => { selection = result.current.handleBookingsChange(["booking-0"]); });
  await waitFor(() => expect(state.readCustomer).toHaveBeenCalledWith(customerA.id));
  const form = result.current.form; const before = structuredClone(form.getValues());
  unmount();
  await act(async () => { customer.resolve(customerA); await selection; });
  expect(form.getValues()).toEqual(before);
});

it.each([null, { ...customerB }])("blocks a missing or mismatched booking receiver without partially applying the selection", async (customer) => {
  state.readCustomer.mockResolvedValue(customer);
  const { result } = setup();
  await act(async () => { await result.current.handleBookingsChange(["booking-0"]); });
  expect(result.current.form.getValues()).toMatchObject({ customerId: "", bookingIds: [], lineItems: [] });
  expect(result.current.chargeBlock).toMatch(/No se pudo verificar el cliente/);
});

it("retries a missing booking customer instead of reusing the cached missing result", async () => {
  state.readCustomer.mockResolvedValueOnce(null).mockResolvedValueOnce(customerA);
  const { result } = setup();
  await act(async () => { await result.current.handleBookingsChange(["booking-0"]); });
  expect(result.current.chargeBlock).toMatch(/No se pudo verificar el cliente/);
  await act(async () => { await result.current.retryChargeAvailability(); });
  expect(state.readCustomer).toHaveBeenCalledTimes(2);
  expect(result.current.form.getValues()).toMatchObject({ customerId: customerA.id, bookingIds: ["booking-0"], cfdi: { receptorRfc: customerA.rfc } });
  expect(result.current.chargeBlock).toBeNull();
});

it("keeps a missing quote customer blocked and completes prefill after a successful retry", async () => {
  state.readCustomer.mockResolvedValueOnce(null).mockResolvedValueOnce(customerA);
  const { result } = setup("quote-a");
  await waitFor(() => expect(result.current.chargeBlock).toMatch(/No se pudieron cargar/));
  expect(result.current.sourceQuoteVersion).toBeNull();
  await act(async () => { await result.current.retryChargeAvailability(); });
  await waitFor(() => expect(result.current.sourceQuoteVersion).toBe(4));
  expect(result.current.form.getValues("cfdi.receptorRfc")).toBe(customerA.rfc);
  expect(result.current.chargeBlock).toBeNull();
});
