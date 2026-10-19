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
