import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { buildEmptyInvoiceValues, EMPTY_LINE, type InvoiceFormValues } from "../../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import { useInvoicePrefill } from "../useInvoicePrefill";
const q = "11111111-1111-4111-8111-111111111111";
const l = "22222222-2222-4222-8222-222222222222";
const source = { quote_line_id: l, line_kind: "charge" as const, description: "Entrega cotizada", quantity: 1, unit_price: 100, total: 100 };
const availability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: q, legacy_review_required: false, lines: [{ quote_line_id: l, line: source, quoted_quantity: 1, consumed_quantity: 0, remaining_quantity: 1 }] }] };
const quote = { id: q, customer_id: "customer", line_items: [source] };

describe("delayed invoice quote prefill", () => {
  it("does not give a dirty manual row the hidden origin of a quote row when availability arrives", async () => {
    const { result, rerender } = renderHook(({ available }: { available?: QuoteChargeAvailability }) => {
      const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
      useInvoicePrefill({ form, existing: undefined, sourceQuote: quote, assignments: [], forklifts: [], customers: [], isEdit: false, chargeAvailability: available });
      return form;
    }, { initialProps: { available: undefined as QuoteChargeAvailability | undefined } });
    const manual = { ...EMPTY_LINE, description: "Trabajo manual distinto", quantity: 2, unit_price: 50, total: 100 };
    act(() => result.current.setValue("lineItems", [manual], { shouldDirty: true }));
    rerender({ available: availability });
    await waitFor(() => expect(result.current.getValues("lineItems")).toHaveLength(2));
    expect(result.current.getValues("lineItems")[0]).toMatchObject({ description: "Entrega cotizada", source_quote_line_id: l });
    expect(result.current.getValues("lineItems")[1]).toEqual(manual);
    rerender({ available: structuredClone(availability) });
    expect(result.current.getValues("lineItems")).toHaveLength(2);
  });

  it("does not overwrite an explicitly changed receiver while waiting for the quote", async () => {
    const { result, rerender } = renderHook(({ loaded }: { loaded: boolean }) => {
      const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
      const prefill = useInvoicePrefill({ form, existing: undefined, requestedQuoteId: q,
        sourceQuote: loaded ? { ...quote, version: 2 } : undefined, assignments: [], forklifts: [], customers: [], isEdit: false,
        chargeAvailability: loaded ? availability : undefined });
      return { form, ...prefill };
    }, { initialProps: { loaded: false } });
    act(() => {
      result.current.form.setValue("customerId", "manual-customer", { shouldDirty: true });
      result.current.form.setValue("customerId", "", { shouldDirty: true });
    });
    rerender({ loaded: true });
    await waitFor(() => expect(result.current.quoteChargePrefillError).toMatch(/Cambiaste el receptor/));
    expect(result.current.sourceQuoteVersion).toBeNull();
    expect(result.current.form.getValues("customerId")).toBe("");
    expect(result.current.form.getValues("lineItems")).toEqual([]);
  });
});
