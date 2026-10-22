import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Forklift } from "@/features/fleet";
import { buildEmptyInvoiceValues, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import { buildAvailableQuoteChargeLines, type QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import { useInvoiceFormHandlers } from "../useInvoiceFormHandlers";
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: vi.fn() }));
const q = "11111111-1111-4111-8111-111111111111";
const l = "22222222-2222-4222-8222-222222222222";
const availability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: q, legacy_review_required: false, lines: [{
  quote_line_id: l, quoted_quantity: 4, consumed_quantity: 1, remaining_quantity: 3,
  line: { quote_line_id: l, line_kind: "charge", description: "Entrega", quantity: 4, unit_price: 100, total: 400 },
}] }] };
const bookings = ["b1", "b2"].map((id) => ({ id, quote_id: q, forklift_id: "f1", start_date: "2026-10-01", end_date: "2026-10-31" }));
const forklifts = [{ id: "f1", name: "MC", daily_rate: 100, weekly_rate: 500, monthly_rate: 1000 }] as Forklift[];
const quotes = [{ id: q, line_items: [availability.quotes[0].lines[0].line], start_date: "2026-10-01", end_date: "2026-10-31" }];
function setup(loadQuoteCharges: (ids: string[]) => Promise<QuoteChargeAvailability>) {
  return renderHook(() => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    return { form, ...useInvoiceFormHandlers({ form, customers: [], bookings, forklifts, quotes, loadQuoteCharges }) };
  });
}
describe("booking selection with persistent charges", () => {
  it("does not infer zero charges from an incomplete booking list", async () => {
    const load = vi.fn().mockResolvedValue(availability);
    const { result } = setup(load);
    await act(async () => { await result.current.handleBookingsChange(["missing"]); });
    expect(result.current.chargeSelectionError).toMatch(/todas las reservas/);
    expect(load).not.toHaveBeenCalled();
    expect(result.current.form.getValues("bookingIds")).toEqual([]);
  });
  it("keeps an own partial charge on sibling reselection and restores a removed charge from availability", async () => {
    const { result } = setup(vi.fn().mockResolvedValue(availability));
    const [line] = buildAvailableQuoteChargeLines([q], availability);
    act(() => result.current.form.setValue("lineItems", [{ ...line, quantity: 0.5, total: 50 }]));
    await act(async () => { await result.current.handleBookingsChange(["b1", "b2"]); });
    let charges = result.current.form.getValues("lineItems").filter((item) => item.source_quote_line_id);
    expect(charges).toHaveLength(1);
    expect(charges[0].quantity).toBe(0.5);
    act(() => result.current.form.setValue("lineItems", []));
    await act(async () => { await result.current.handleBookingsChange(["b2"]); });
    charges = result.current.form.getValues("lineItems").filter((item) => item.source_quote_line_id);
    expect(charges).toHaveLength(1);
    expect(charges[0].quantity).toBe(3);
  });
  it("blocks failed availability with an actionable retry without replacing entered rows", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("Reintenta la consulta")).mockResolvedValue(availability);
    const { result } = setup(load);
    await act(async () => { await result.current.handleBookingsChange(["b1"]); });
    expect(result.current.chargeSelectionError).toMatch(/Reintenta/);
    expect(result.current.form.getValues("bookingIds")).toEqual([]);
    await act(async () => { await result.current.retryChargeSelection(); });
    expect(result.current.chargeSelectionError).toBeNull();
    expect(result.current.form.getValues("bookingIds")).toEqual(["b1"]);
  });
  it("a late response cannot replace a newer booking selection", async () => {
    let resolveFirst!: (value: QuoteChargeAvailability) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<QuoteChargeAvailability>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(availability);
    const { result } = setup(load);
    let first!: Promise<void>;
    act(() => { first = result.current.handleBookingsChange(["b1"]); });
    await act(async () => { await result.current.handleBookingsChange(["b2"]); });
    await act(async () => { resolveFirst(availability); await first; });
    expect(result.current.form.getValues("bookingIds")).toEqual(["b2"]);
  });
});

import { originalPeriodBooking } from "../../../lib/originalBookingPeriod";

describe("extension-first original period prefill", () => {
  it("prefills only Oct 23–24, USD 2×100 and FX 17.5 without repeating consumed logistics", async () => {
    const operational = { id: "original", forklift_id: "f1", quote_id: q, start_date: "2026-10-23", end_date: "2026-10-26",
      currency: "USD", tipo_cambio: 17.5, daily_rate: 100, recurring_billing: false };
    const original = originalPeriodBooking(operational, [{ booking_id: "original", original_end_date: "2026-10-24", new_end_date: "2026-10-26", pending_invoice_id: "draft-extension" }])!;
    const consumed: QuoteChargeAvailability = { complete: true, quotes: [{ ...availability.quotes[0], lines: [{ ...availability.quotes[0].lines[0], consumed_quantity: 4, remaining_quantity: 0 }] }] };
    const { result } = renderHook(() => {
      const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
      return { form, ...useInvoiceFormHandlers({ form, customers: [], bookings: [original], forklifts,
        quotes: [{ ...quotes[0], start_date: "2026-10-23", end_date: "2026-10-24" }], loadQuoteCharges: async () => consumed }) };
    });
    await act(async () => { await result.current.handleBookingsChange([original.id]); });
    expect(result.current.chargeSelectionError).toBeNull();
    expect(result.current.form.getValues("billingPeriodStart")).toBe("2026-10-23");
    expect(result.current.form.getValues("billingPeriodEnd")).toBe("2026-10-24");
    expect(result.current.form.getValues("cfdi.moneda")).toBe("USD");
    expect(result.current.form.getValues("cfdi.tipoCambio")).toBe(17.5);
    expect(result.current.form.getValues("lineItems")).toHaveLength(1);
    expect(result.current.form.getValues("lineItems")[0]).toMatchObject({ quantity: 2, unit_price: 100, total: 200, line_kind: "rental" });
    await act(async () => { await result.current.handleBookingsChange([original.id]); });
    expect(result.current.form.getValues("lineItems")).toHaveLength(1);
    expect(operational.end_date).toBe("2026-10-26");
  });
});

import { completedRecurringBooking } from "../../../lib/completedRecurringBooking";

describe("returned quote-backed booking recovery integration", () => {
  const quotedLines = [
    { description: "QA — Renta mensual", quantity: 2, unit_price: 3000, total: 6000, line_kind: "rental" as const },
    { description: "QA — Renta diaria", quantity: 16, unit_price: 100, total: 1600, line_kind: "rental" as const },
  ];
  const unit = { ...forklifts[0], daily_rate: 100, weekly_rate: 700, monthly_rate: 3000 };
  const operational = { id: "returned", forklift_id: "f1", quote_id: q, status: "completed", recurring_billing: true,
    start_date: "2026-07-15", end_date: "2026-09-30", monthly_rate: 3000, daily_rate: 100, weekly_rate: 700 };
  const quote = { id: q, line_items: quotedLines, start_date: operational.start_date, end_date: operational.end_date,
    rental_meta: [{ modelId: "qa", quantity: 1, dailyRate: 100, weeklyRate: 700, monthlyRate: 3000, discount: 0 }] };
  const returned = [{ booking_id: operational.id, forklift_id: "f1", inspected_at: "2026-10-10T18:00:00Z" }];
  const noCharges: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: q, legacy_review_required: false, lines: [] }] };
  it.each([false, true])("retains the actual booking recurrence flag=%s despite full-term quote rows", async (recurring) => {
    const source = { ...operational, recurring_billing: recurring };
    const projected = completedRecurringBooking(source, [], returned, new Date("2026-10-22T18:00:00Z")).booking;
    if (!projected) throw new Error("Expected available booking");
    const { result } = renderHook(() => {
      const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
      return { form, ...useInvoiceFormHandlers({ form, customers: [], bookings: [projected], forklifts: [unit], quotes: [quote], loadQuoteCharges: async () => noCharges }) };
    });
    // Existing full-term quote rows must not survive a successful selection.
    act(() => result.current.form.setValue("lineItems", quotedLines));
    await act(async () => { await result.current.handleBookingsChange([operational.id]); });
    expect(result.current.chargeSelectionError).toBeNull();
    expect(result.current.form.getValues("billingPeriodStart")).toBe("2026-07-15");
    expect(result.current.form.getValues("billingPeriodEnd")).toBe(recurring ? "2026-07-31" : "2026-09-30");
    const subtotal = result.current.form.getValues("lineItems").reduce((sum, line) => sum + line.total, 0);
    expect(subtotal).toBe(recurring ? 1645.16 : 7600);
    if (recurring) expect(result.current.form.getValues("lineItems")).toHaveLength(1);
  });
});
