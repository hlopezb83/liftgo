import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";
import type { Forklift } from "@/features/fleet";
import { buildEmptyInvoiceValues, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import type { Customer } from "../invoiceFormBuilders";
import { useInvoiceFormHandlers } from "../useInvoiceFormHandlers";
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: vi.fn() }));
const q = "11111111-1111-4111-8111-111111111111";
const availability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: q, legacy_review_required: false, lines: [] }] };
const a = { id: "a", name: "QA A", rfc: "XAXX010101000", uso_cfdi: "G03", tax_rate: 16 };
const b = { id: "b", name: "QA B", rfc: "XEXX010101000", uso_cfdi: "S01", tax_rate: 8 };
function setup(customerA: Customer = a) {
  let resolve!: (v: QuoteChargeAvailability) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<QuoteChargeAvailability>((r, j) => { resolve = r; reject = j; });
  const hook = renderHook(() => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    return { form, ...useInvoiceFormHandlers({ form, customers: [customerA, b],
      bookings: [{ id: "booking-a", customer_id: a.id, customer_name: a.name, quote_id: q, forklift_id: "f1", start_date: "2026-10-01", end_date: "2026-10-02", currency: "MXN" }],
      forklifts: [{ id: "f1", name: "QA", daily_rate: 100, weekly_rate: 500, monthly_rate: 1000 }] as Forklift[],
      quotes: [{ id: q, line_items: [], start_date: "2026-10-01", end_date: "2026-10-02" }], loadQuoteCharges: () => pending }) };
  });
  return { ...hook, resolve, reject };
}
it("preserves a newer explicit customer and requires review after canceling a booking request", async () => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  expect(result.current.isLoadingCharges).toBe(true);
  act(() => result.current.handleCustomerSelect(b.id, b));
  expect(result.current.form.getValues()).toMatchObject({ customerId: b.id, taxRate: 8, cfdi: { receptorRfc: b.rfc, usoCfdi: "S01" } });
  await act(async () => { resolve(availability); await pending; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: b.id, bookingIds: [], taxRate: 8, cfdi: { receptorRfc: b.rfc, usoCfdi: "S01" } });
  expect(result.current.chargeSelectionError).toMatch(/vuelve a seleccionar/i);
  expect(result.current.isLoadingCharges).toBe(false);
  await act(async () => { await result.current.retryChargeSelection(); await result.current.handleBookingsChange([]); });
  expect(result.current.chargeSelectionError).toMatch(/vuelve a seleccionar/i);
  expect(result.current.form.getValues("customerId")).toBe(b.id);
});
it("preserves manual tax, usage and currency edited during loading", async () => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  act(() => {
    result.current.form.setValue("taxRate", 8, { shouldDirty: true });
    result.current.form.setValue("cfdi.usoCfdi", "S01", { shouldDirty: true });
    result.current.form.setValue("cfdi.moneda", "USD", { shouldDirty: true });
    result.current.form.setValue("cfdi.tipoCambio", 17.5, { shouldDirty: true });
  });
  await act(async () => { resolve(availability); await pending; });
  expect(result.current.form.getValues()).toMatchObject({ taxRate: 8, cfdi: { usoCfdi: "S01", moneda: "USD", tipoCambio: 17.5 } });
  expect(result.current.chargeSelectionError).toBeNull();
});

it("does not mix receivers when the original customer lacks fiscal defaults", async () => {
  const { result, resolve } = setup({ ...a, uso_cfdi: "", tax_rate: null }); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  act(() => result.current.handleCustomerSelect(b.id, b));
  await act(async () => { resolve(availability); await pending; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: b.id, bookingIds: [], taxRate: 8, cfdi: { receptorRfc: b.rfc, usoCfdi: "S01" } });
});

it("ignores a canceled request rejection but keeps the actionable review block", async () => {
  const { result, reject } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  act(() => result.current.handleCustomerSelect(b.id, b));
  await act(async () => { reject(new Error("Old network failure")); await pending; });
  expect(result.current.chargeSelectionError).toMatch(/vuelve a seleccionar/i);
  expect(result.current.isLoadingCharges).toBe(false);
  expect(result.current.form.getValues("customerId")).toBe(b.id);
});
it("detaches incompatible committed bookings and blocks retained rows until explicit reselection", async () => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  await act(async () => { resolve(availability); await pending; });
  const rows = result.current.form.getValues("lineItems");
  act(() => result.current.handleCustomerSelect(b.id, b));
  expect(result.current.form.getValues()).toMatchObject({ bookingIds: [], bookingId: "", customerId: b.id, lineItems: rows });
  expect(result.current.chargeSelectionError).toMatch(/revisa las partidas/);
  await act(async () => { await result.current.handleBookingsChange(["booking-a"]); });
  expect(result.current.form.getValues()).toMatchObject({ bookingIds: ["booking-a"], customerId: a.id });
  expect(result.current.chargeSelectionError).toBeNull();
});

it("recovers committed links by explicitly returning to their customer without a booking selector", async () => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  await act(async () => { resolve(availability); await pending; });
  act(() => result.current.handleCustomerSelect(b.id, b));
  expect(result.current.form.getValues("bookingIds")).toEqual([]);
  expect(result.current.chargeSelectionError).toMatch(/cliente anterior/);
  act(() => result.current.handleCustomerSelect(a.id, a));
  expect(result.current.form.getValues()).toMatchObject({ bookingIds: ["booking-a"], bookingId: "booking-a", customerId: a.id });
  expect(result.current.chargeSelectionError).toBeNull();
});
it("does not detach a saved link when the same customer is selected before bookings load", () => {
  const { result } = setup();
  act(() => {
    result.current.form.setValue("customerId", a.id);
    result.current.form.setValue("bookingIds", ["not-yet-loaded"]);
    result.current.form.setValue("bookingId", "not-yet-loaded");
    result.current.handleCustomerSelect(a.id, a);
  });
  expect(result.current.form.getValues("bookingIds")).toEqual(["not-yet-loaded"]);
  expect(result.current.chargeSelectionError).toBeNull();
});

it("clearing during a review reselection cancels its late response and keeps the block", async () => {
  const { result, resolve } = setup(); let first!: Promise<void>; let second!: Promise<void>;
  act(() => { first = result.current.handleBookingsChange(["booking-a"]); });
  act(() => result.current.handleCustomerSelect(b.id, b));
  act(() => { second = result.current.handleBookingsChange(["booking-a"]); });
  await act(async () => { await result.current.handleBookingsChange([]); });
  await act(async () => { resolve(availability); await first; await second; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: b.id, bookingIds: [] });
  expect(result.current.isLoadingCharges).toBe(false);
  expect(result.current.chargeSelectionError).toBeTruthy();
});

it("restoring the previous customer while a reselection is pending does not reintroduce the block", async () => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => {
    result.current.form.setValue("customerId", a.id);
    result.current.form.setValue("bookingIds", ["booking-a"]);
    result.current.form.setValue("bookingId", "booking-a");
    result.current.handleCustomerSelect(b.id, b);
  });
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  act(() => result.current.handleCustomerSelect(a.id, a));
  expect(result.current.chargeSelectionError).toBeNull();
  await act(async () => { resolve(availability); await pending; });
  expect(result.current.form.getValues()).toMatchObject({ customerId: a.id, bookingIds: ["booking-a"] });
  expect(result.current.chargeSelectionError).toBeNull();
});

it.each(["receptorRfc", "receptorRazonSocial", "receptorRegimenFiscal", "receptorDomicilioFiscalCp"] as const)("preserves a manual %s edit during loading", async (field) => {
  const { result, resolve } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  act(() => result.current.form.setValue(`cfdi.${field}`, "manual", { shouldDirty: true }));
  await act(async () => { resolve(availability); await pending; });
  expect(result.current.form.getValues(`cfdi.${field}`)).toBe("manual");
  expect(result.current.form.getValues("customerId")).toBe(a.id);
});


it("replaces a completed load failure with actionable review after customer selection", async () => {
  const { result, reject } = setup(); let pending!: Promise<void>;
  act(() => { pending = result.current.handleBookingsChange(["booking-a"]); });
  await act(async () => { reject(new Error("Network unavailable")); await pending; });
  expect(result.current.chargeSelectionError).toBe("Network unavailable");
  act(() => result.current.handleCustomerSelect(b.id, b));
  expect(result.current.chargeSelectionError).toMatch(/vuelve a seleccionar/i);
  await act(async () => { await result.current.retryChargeSelection(); });
  expect(result.current.form.getValues("customerId")).toBe(b.id);
  expect(result.current.chargeSelectionError).toMatch(/vuelve a seleccionar/i);
});
