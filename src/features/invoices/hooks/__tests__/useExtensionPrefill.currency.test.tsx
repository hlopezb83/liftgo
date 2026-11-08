import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

const state = vi.hoisted(() => ({
  source: {} as Record<string, unknown>,
  response: null as Record<string, unknown> | null,
  select: "",
  includeUnrequestedFields: false,
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  customerLoaded: true,
  listIncludesCustomer: true,
  customerUnavailable: false,
  customerError: false,
}));

// Simulate only transport projection: the production query determines which
// fields reach the production prefill, RHF state, line builder and totals.
function project(source: Record<string, unknown>, selection: string): Record<string, unknown> {
  const fields: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selection.length; index += 1) {
    if (selection[index] === "(") depth += 1;
    if (selection[index] === ")") depth -= 1;
    if (selection[index] === "," && depth === 0) {
      fields.push(selection.slice(start, index).trim());
      start = index + 1;
    }
  }
  fields.push(selection.slice(start).trim());
  return Object.fromEntries(fields.flatMap((field) => {
    const open = field.indexOf("(");
    const key = (open < 0 ? field : field.slice(0, open)).replace(/!.*$/, "").trim();
    if (!(key in source)) return [];
    const value = source[key];
    return [[key, open >= 0 && value && typeof value === "object"
      ? project(value as Record<string, unknown>, field.slice(open + 1, -1))
      : value]];
  }));
}

function readExtension(calls: ChainCall[]) {
  state.select = String(calls.find((call) => call.method === "select")?.args[0] ?? "");
  state.response = state.includeUnrequestedFields ? state.source : project(state.source, state.select);
  return { data: state.response, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: { booking_extensions: readExtension } }),
}));
vi.mock("@/features/users", () => ({ useHasFinancialAccess: () => true }));
vi.mock("@/features/fleet", () => ({
  forkliftKeys: { all: ["forklifts"] }, useForklifts: () => ({ data: [forklift] }),
}));
vi.mock("@/features/customers", async () => ({
  ...await vi.importActual("@/features/customers/lib/customerTaxRate"), useCustomer: () => ({ data: state.customerLoaded && !state.customerUnavailable ? customer : null, isPending: !state.customerLoaded, isFetching: !state.customerLoaded, isError: state.customerError, refetch: vi.fn() }) }));
vi.mock("@/features/bookings", async () => ({
  ...await vi.importActual("@/features/bookings/hooks/bookingActions/useBookingExtensions"),
  ...await vi.importActual("@/features/bookings/lib/extensionBilling"),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: state.notifyError,
  notifyWarning: state.notifyWarning,
  notifyValidation: vi.fn(),
}));

import { useExtendBookingPreview } from "@/features/bookings/hooks/bookingActions/useExtendBookingPreview";
import type { BookingWithForklift } from "@/features/bookings/hooks/bookings/useBookings";
import { useExtensionPrefill } from "../useExtensionPrefill";
import { useInvoiceFormHandlers } from "../invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormTotals } from "../invoiceForm/useInvoiceFormTotals";
import { buildEmptyInvoiceValues, invoiceFormSchema } from "../../lib/invoiceFormSchema";

const customer = { id: "synthetic-customer", name: "Synthetic customer", tax_rate: 0 as number | null | undefined };
const forklift = {
  id: "synthetic-unit", name: "Synthetic forklift", serial_number: "SYNTHETIC",
  daily_rate: 900, weekly_rate: 6000, monthly_rate: 20000,
};
const booking = {
  id: "synthetic-booking", booking_number: "SYNTHETIC-EXTENSION", customer_id: customer.id,
  customer_name: customer.name, forklift_id: forklift.id,
  start_date: "2026-10-18", end_date: "2026-10-22", recurring_billing: false,
  daily_rate: 100, weekly_rate: 600, monthly_rate: 2000,
  currency: "USD", tipo_cambio: 17.5, forklifts: forklift,
};

function useRealPrefill(edit: boolean) {
  const defaults = buildEmptyInvoiceValues();
  // An earlier manual value must not survive applying a different booking.
  defaults.cfdi = { ...defaults.cfdi, moneda: "EUR", tipoCambio: 22 };
  const form = useForm({ defaultValues: defaults });
  const handlers = useInvoiceFormHandlers({
    form, customers: state.listIncludesCustomer ? [customer] : [], bookings: [booking], forklifts: [forklift] as never,
    // Extension currency fixtures have no quote charges to load.
    loadQuoteCharges: async () => {
      throw new Error("Unexpected quote-charge lookup in extension currency test");
    },
  });
  const prefill = useExtensionPrefill({
    form, isEdit: edit, extensionId: "synthetic-extension",
    handleCustomerSelect: handlers.handleCustomerSelect,
  });
  const totals = useInvoiceFormTotals(form);
  const preview = useExtendBookingPreview({ ...booking, end_date: String(state.source.original_end_date) } as unknown as BookingWithForklift,
    new Date(`${String(state.source.new_end_date)}T12:00:00`));
  return { form, prefill, totals, preview, handlers };
}

function renderPrefill(loaded = true, edit = false) {
  const { Wrapper } = createQueryWrapper();
  state.customerLoaded = loaded;
  const hook = renderHook((props) => useRealPrefill(props.edit), {
    wrapper: Wrapper, initialProps: { loaded, edit },
  });
  return { ...hook, rerender: (props: { loaded: boolean; edit: boolean }) => {
    state.customerLoaded = props.loaded;
    hook.rerender(props);
  } };
}

async function waitUntilPrefilled(result: ReturnType<typeof renderPrefill>["result"]) {
  await waitFor(() => {
    expect(result.current.form.getValues("lineItems")).toHaveLength(1);
    // RHF updates its store before the subscribed useWatch render updates totals.
    expect(result.current.totals).toMatchObject({ subtotal: 200, total: 200 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  customer.tax_rate = 0;
  state.customerLoaded = true;
  state.listIncludesCustomer = true;
  state.customerUnavailable = false;
  state.customerError = false;
  state.includeUnrequestedFields = false;
  state.select = "";
  state.response = null;
  state.source = {
    id: "synthetic-extension", booking_id: booking.id,
    original_end_date: "2026-10-20", new_end_date: "2026-10-22", reason: "Synthetic only",
    created_at: "2026-10-19T12:00:00Z", invoice_id: null, pending_invoice_id: null, billed_at: null,
    bookings: { ...booking },
  };
});
afterEach(cleanup);

describe("extension invoice currency through the actual query and prefill", () => {
  it("inherits USD/17.5 while preserving the agreed numeric rate and extended period", async () => {
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(state.response?.bookings).toMatchObject({ currency: "USD", tipo_cambio: 17.5 });
    expect(result.current.form.getValues()).toMatchObject({
      customerId: customer.id, bookingId: booking.id, bookingIds: [booking.id],
      billingPeriodStart: "2026-10-21", billingPeriodEnd: "2026-10-22",
      cfdi: { moneda: "USD", tipoCambio: 17.5 },
      lineItems: [{ quantity: 2, unit_price: 100, total: 200 }],
    });
    expect(result.current.totals).toMatchObject({ subtotal: 200, total: 200 });
    expect(invoiceFormSchema.safeParse(result.current.form.getValues()).success).toBe(true);
  });

  it("also applies currency when the transport already supplies the complete booking", async () => {
    state.includeUnrequestedFields = true;
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "USD", tipoCambio: 17.5 });
  });

  it.each(["MXN", null, ""])("normalizes domestic or missing currency %s to MXN/1", async (currency) => {
    state.source.bookings = { ...booking, currency, tipo_cambio: 17.5 };
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "MXN", tipoCambio: 1 });
    expect(result.current.form.getValues("lineItems")[0]).toMatchObject({ quantity: 2, unit_price: 100, total: 200 });
  });

  it("uses the same currency normalization as the primary-booking prefill", async () => {
    state.source.bookings = { ...booking, currency: " usd " };
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "USD", tipoCambio: 17.5 });
  });

  it.each([null, 0, -17.5, Number.NaN])("clears unusable foreign FX %s and blocks submission", async (tipo_cambio) => {
    state.source.bookings = { ...booking, tipo_cambio };
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "USD", tipoCambio: 0 });
    const parsed = invoiceFormSchema.safeParse(result.current.form.getValues());
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toContainEqual(["cfdi", "tipoCambio"]);
    expect(result.current.totals.total).toBe(200);
  });

  it("preserves the existing validation against placeholder foreign FX 1", async () => {
    state.source.bookings = { ...booking, tipo_cambio: 1 };
    const { result } = renderPrefill();
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "USD", tipoCambio: 1 });
    expect(invoiceFormSchema.safeParse(result.current.form.getValues()).success).toBe(false);
  });

  it("waits for customer detail, then inherits currency once without overwriting later edits", async () => {
    const { result, rerender } = renderPrefill(false);
    await waitFor(() => expect(result.current.prefill.extension).not.toBeNull());
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.form.getValues("cfdi.moneda")).toBe("EUR");
    rerender({ loaded: true, edit: false });
    await waitUntilPrefilled(result);
    expect(result.current.form.getValues("cfdi.moneda")).toBe("USD");
    act(() => result.current.form.setValue("cfdi.tipoCambio", 18));
    rerender({ loaded: true, edit: false });
    expect(result.current.form.getValues("cfdi.tipoCambio")).toBe(18);
  });

  it("does not apply extension data while editing an existing invoice", () => {
    const { result } = renderPrefill(true, true);
    expect(state.select).toBe("");
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "EUR", tipoCambio: 22 });
  });

  it("keeps the already-invoiced guard ahead of all prefill fields", async () => {
    state.source.invoice_id = "synthetic-issued-invoice";
    const { result } = renderPrefill();
    await waitFor(() => expect(state.notifyError).toHaveBeenCalled());
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.form.getValues("bookingIds")).toEqual([]);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "EUR", tipoCambio: 22 });
  });

  it("keeps the no-billable-days guard ahead of all prefill fields", async () => {
    state.source.new_end_date = "2026-10-20";
    const { result } = renderPrefill();
    await waitFor(() => expect(state.notifyWarning).toHaveBeenCalled());
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.form.getValues("cfdi")).toMatchObject({ moneda: "EUR", tipoCambio: 22 });
  });
  it.each([0, 8, 16, null, undefined])("matches extension preview to the real draft prefill and totals for customer VAT %s", async (rate) => {
    customer.tax_rate = rate;
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(1));
    await waitFor(() => expect(result.current.totals.subtotal).toBe(200));
    expect(result.current.form.getValues("taxRate")).toBe(rate ?? 16);
    expect(result.current.preview).toMatchObject({
      ...result.current.totals, taxRate: result.current.form.getValues("taxRate"),
      currency: result.current.form.getValues("cfdi.moneda"),
      range: { start: "2026-10-21", end: "2026-10-22", days: 2 },
    });
    expect(result.current.totals).toEqual({ subtotal: 200, taxAmount: 200 * (rate ?? 16) / 100, total: 200 + 200 * (rate ?? 16) / 100 });
    expect(result.current.form.getValues("lineItems")[0]).toMatchObject(result.current.preview!.items[0]);
  });

  it("does not change the booking-selection policy for a missing customer rate", async () => {
    customer.tax_rate = null;
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(1));
    act(() => result.current.form.setValue("taxRate", 8));
    await act(async () => result.current.handlers.handleBookingsChange([booking.id]));
    // Existing booking prefill only overrides tax when the customer supplies it.
    expect(result.current.form.getValues("taxRate")).toBe(8);
    act(() => result.current.handlers.handleCustomerSelect(customer.id));
    // Explicit customer selection still resets the invoice default first.
    expect(result.current.form.getValues("taxRate")).toBe(16);
  });

  it.each([0, 8, 16, null, undefined])("matches preview with an empty customer list and detail VAT %s", async (rate) => {
    customer.tax_rate = rate;
    state.listIncludesCustomer = false;
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.totals.subtotal).toBe(200));
    expect(result.current.form.getValues()).toMatchObject({ customerId: customer.id, taxRate: rate ?? 16 });
    expect(result.current.preview).toMatchObject(result.current.totals);
    expect(result.current.prefill.prefillBlock).toBeNull();
  });

  it.each(["missing", "error"])("does not apply default 16 or lines when customer detail is %s", async (mode) => {
    state.customerUnavailable = mode === "missing";
    state.customerError = mode === "error";
    const { result } = renderPrefill();
    await waitFor(() => expect(result.current.prefill.extension).not.toBeNull());
    expect(result.current.prefill.prefillBlock).toMatch(/No se pudo verificar el cliente/);
    expect(result.current.form.getValues("customerId")).toBe("");
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    expect(result.current.form.getValues("cfdi.moneda")).toBe("EUR");
  });

  it.each(["customer", "clear", "reset", "tax"])("never overwrites a newer %s action while detail is pending", async (action) => {
    const { result, rerender } = renderPrefill(false);
    await waitFor(() => expect(result.current.prefill.extension).not.toBeNull());
    expect(result.current.prefill.prefillBlock).toMatch(/Verificando/);
    act(() => {
      if (action === "customer") result.current.handlers.handleCustomerSelect("other", { id: "other", name: "Other", tax_rate: 8 });
      if (action === "clear") {
        // The public form handler marks explicit intent even if RHF's value is
        // already empty (a no-op setValue does not emit a subscription event).
        result.current.prefill.interruptPrefill();
        result.current.handlers.handleCustomerSelect("");
      }
      if (action === "reset") result.current.form.reset();
      if (action === "tax") result.current.form.setValue("taxRate", 8, { shouldDirty: true });
    });
    const before = result.current.form.getValues();
    rerender({ loaded: true, edit: false });
    await waitFor(() => expect(result.current.prefill.prefillBlock).toMatch(/Cambiaste el formulario/));
    expect(result.current.form.getValues()).toEqual(before);
    expect(result.current.form.getValues("lineItems")).toEqual([]);
  });

});
