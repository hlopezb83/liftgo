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
vi.mock("@/features/fleet", () => ({ forkliftKeys: { all: ["forklifts"] } }));
vi.mock("@/features/bookings", async () => ({
  ...await vi.importActual("@/features/bookings/hooks/bookingActions/useBookingExtensions"),
  ...await vi.importActual("@/features/bookings/lib/extensionBilling"),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: state.notifyError,
  notifyWarning: state.notifyWarning,
  notifyValidation: vi.fn(),
}));

import { useExtensionPrefill } from "../useExtensionPrefill";
import { useInvoiceFormHandlers } from "../invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormTotals } from "../invoiceForm/useInvoiceFormTotals";
import { buildEmptyInvoiceValues, invoiceFormSchema } from "../../lib/invoiceFormSchema";

const customer = { id: "synthetic-customer", name: "Synthetic customer", tax_rate: 0 };
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

function useRealPrefill(loaded: boolean, edit: boolean) {
  const defaults = buildEmptyInvoiceValues();
  // An earlier manual value must not survive applying a different booking.
  defaults.cfdi = { ...defaults.cfdi, moneda: "EUR", tipoCambio: 22 };
  const form = useForm({ defaultValues: defaults });
  const handlers = useInvoiceFormHandlers({
    form, customers: [customer], bookings: [booking], forklifts: [forklift] as never,
    // Extension currency fixtures have no quote charges to load.
    loadQuoteCharges: async () => {
      throw new Error("Unexpected quote-charge lookup in extension currency test");
    },
  });
  const prefill = useExtensionPrefill({
    form, isEdit: edit, extensionId: "synthetic-extension", customersLoaded: loaded,
    handleCustomerSelect: handlers.handleCustomerSelect,
  });
  const totals = useInvoiceFormTotals(form);
  return { form, prefill, totals };
}

function renderPrefill(loaded = true, edit = false) {
  const { Wrapper } = createQueryWrapper();
  return renderHook((props) => useRealPrefill(props.loaded, props.edit), {
    wrapper: Wrapper, initialProps: { loaded, edit },
  });
}

async function waitUntilPrefilled(result: ReturnType<typeof renderPrefill>["result"]) {
  await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(1));
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it("waits for customers, then inherits currency once without overwriting later edits", async () => {
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
});
