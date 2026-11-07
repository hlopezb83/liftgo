import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { buildEmptyInvoiceValues, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import type { SourceQuote } from "../invoiceFormBuilders";
import { useInvoicePrefill } from "../useInvoicePrefill";

type Quote = SourceQuote & { version?: number };
interface Props { quote?: Quote; availability?: QuoteChargeAvailability }
const quote: Quote = { id: "quote-1", version: 4, customer_id: "customer-1", notes: "Original", line_items: [], tax_rate: 16 };
const availability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: "quote-1", legacy_review_required: false, lines: [] }] };
function setup(initialProps: Props) {
  return renderHook(({ quote: sourceQuote, availability: chargeAvailability }: Props) => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    const prefill = useInvoicePrefill({ form, sourceQuote, chargeAvailability, existing: undefined, customers: [], forklifts: [], assignments: [], isEdit: false });
    return { form, ...prefill };
  }, { initialProps });
}

describe("quote prefill version follows the form snapshot", () => {
  it("preserves original data and version across a same-ID refetch and local edits", () => {
    const { result, rerender } = setup({ quote, availability });
    expect(result.current.sourceQuoteVersion).toBe(4);
    act(() => result.current.form.setValue("notes", "Local draft", { shouldDirty: true }));
    rerender({ quote: { ...quote, version: 5, notes: "Remote", tax_rate: 8 }, availability });
    expect(result.current.sourceQuoteVersion).toBe(4);
    expect(result.current.form.getValues()).toMatchObject({ notes: "Local draft", taxRate: 16 });
  });
  it("captures the version at successful prefill, not while dependencies load", () => {
    const { result, rerender } = setup({ quote });
    expect(result.current.sourceQuoteVersion).toBeNull();
    rerender({ quote: { ...quote, version: 5, notes: "Latest before prefill" }, availability });
    expect(result.current.sourceQuoteVersion).toBe(5);
    expect(result.current.form.getValues("notes")).toBe("Latest before prefill");
  });
  it("does not capture a failed prefill or reuse a prior quote version", () => {
    const { result, rerender } = setup({ quote, availability });
    rerender({ quote: { ...quote, id: "quote-2", version: 7 }, availability });
    expect(result.current.sourceQuoteVersion).toBeNull();
    expect(result.current.quoteChargePrefillError).toBeTruthy();
    rerender({ quote: { ...quote, id: "quote-2", version: 8 }, availability: { complete: true, quotes: [{ quote_id: "quote-2", legacy_review_required: false, lines: [] }] } });
    expect(result.current.sourceQuoteVersion).toBe(8);
    expect(result.current.quoteChargePrefillError).toBeNull();
  });
  it("does not advance a missing original version on refetch", () => {
    const { result, rerender } = setup({ quote: { ...quote, version: undefined }, availability });
    rerender({ quote: { ...quote, version: 5 }, availability });
    expect(result.current.sourceQuoteVersion).toBeNull();
  });
});
