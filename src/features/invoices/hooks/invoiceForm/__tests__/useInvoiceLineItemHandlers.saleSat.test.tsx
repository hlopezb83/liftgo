import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { buildEmptyInvoiceValues, type InvoiceFormValues, type LineItemValues } from "../../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import type { ExistingInvoice, SourceQuote } from "../invoiceFormBuilders";
import type { InvoiceLineItemSource } from "../invoiceSatDefaults";
import { useInvoiceLineItemHandlers } from "../useInvoiceLineItemHandlers";
import { useInvoicePrefill } from "../useInvoicePrefill";

const quoteId = "11111111-1111-4111-8111-111111111111";
const sale: LineItemValues = { description: "Venta", quantity: 1, unit_price: 1000, total: 1000, line_kind: "sale", clave_prod_serv: "24101603", clave_unidad: "H87" };
const availability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] };

function setup(source: InvoiceLineItemSource = {}, lines: LineItemValues[] = []) {
  return renderHook(({ source }) => {
    const form = useForm<InvoiceFormValues>({ defaultValues: { ...buildEmptyInvoiceValues(), lineItems: lines } });
    const handlers = useInvoiceLineItemHandlers(form, source);
    return { form, handlers };
  }, { initialProps: { source } });
}

function expectExplicit(line: LineItemValues) {
  expect(line).toMatchObject({ clave_prod_serv: "", clave_unidad: "" });
}

describe("sale SAT additions with real form/field-array state", () => {
  it.each([
    { quoteId, quoteType: "sale" },
    { originalLines: [sale] },
  ])("adds blank sale codes from persistent source context: %j", (source) => {
    const { result } = setup(source);
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
    expect(result.current.form.getValues("lineItems.0.line_kind")).toBe("sale");
  });

  it("retains inferred sale context after deleting the final row and adding repeatedly", () => {
    const { result } = setup({}, [sale]);
    act(() => result.current.handlers.removeLineItem(0));
    expect(result.current.form.getValues("lineItems")).toEqual([]);
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
    expect(result.current.form.getValues("lineItems.0.line_kind")).toBe("sale");
    act(() => {
      result.current.handlers.removeLineItem(0);
      result.current.handlers.addLineItem();
    });
    expectExplicit(result.current.form.getValues("lineItems.0"));
    expect(result.current.form.getValues("lineItems.0.source_quote_id")).toBeUndefined();
  });

  it.each([
    { key: "quote:pending", quoteId },
    { key: "invoice:historical", quoteId, quoteType: null },
    { key: "invoice:loading", isLoading: true },
  ])("adds conservatively for unresolved sources without clearing existing fields: %j", (source) => {
    const historical = { ...sale, line_kind: "manual" as const, clave_prod_serv: "78181500", clave_unidad: "DAY" };
    const { result } = setup(source, [historical]);
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toEqual(historical);
    expectExplicit(result.current.form.getValues("lineItems.1"));
  });

  it("keeps rental defaults and does not infer a sale just from a quote ID", () => {
    const { result } = setup({ quoteId, quoteType: "rental" });
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toMatchObject({ line_kind: "manual", clave_prod_serv: "78181500", clave_unidad: "DAY" });
  });

  it("keeps unknown historical quote references conservative after the last row is deleted", () => {
    const historical: LineItemValues = { description: "Cargo histórico", quantity: 1, unit_price: 100, total: 100,
      source_quote_id: quoteId, source_quote_line_id: "22222222-2222-4222-8222-222222222222", clave_prod_serv: "78101800", clave_unidad: "E48" };
    const { result } = setup({}, [historical]);
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toEqual(historical);
    expectExplicit(result.current.form.getValues("lineItems.1"));
    act(() => result.current.handlers.removeLineItem(1));
    act(() => result.current.handlers.removeLineItem(0));
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
    expect(result.current.form.getValues("lineItems.0.line_kind")).toBe("manual");
    expect(result.current.form.getValues("lineItems.0.source_quote_id")).toBeUndefined();
  });

  it("does not treat a different historical quote as confirmed rental", () => {
    const { result } = setup({ quoteId: "known-rental", quoteType: "rental", originalLines: [{ source_quote_id: quoteId }] });
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
  });

  it("allows rental defaults after the exact remembered quote resolves as rental", () => {
    const { result, rerender } = setup({ key: "same", quoteId }, [{ ...sale, line_kind: "manual", source_quote_id: quoteId }]);
    act(() => result.current.handlers.removeLineItem(0));
    rerender({ source: { key: "same", quoteId, quoteType: "rental" } });
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toMatchObject({ line_kind: "manual", clave_prod_serv: "78181500", clave_unidad: "DAY" });
  });

  it("resets only the remembered sale context when the source changes to a confirmed rental", () => {
    const { result, rerender } = setup({ key: "sale" }, [sale]);
    act(() => result.current.handlers.removeLineItem(0));
    rerender({ source: { key: "rental", quoteId, quoteType: "rental" } });
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toMatchObject({ line_kind: "manual", clave_prod_serv: "78181500", clave_unidad: "DAY" });
  });

  it("does not reuse the previous rental source defaults while the next quote is unresolved", () => {
    const { result, rerender } = setup({ key: "rental", quoteId, quoteType: "rental" });
    act(() => result.current.handlers.addLineItem());
    const original = result.current.form.getValues("lineItems.0");
    rerender({ source: { key: "next", quoteId: "next-quote" } });
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toEqual(original);
    expectExplicit(result.current.form.getValues("lineItems.1"));
  });
});

interface PrefillProps { quote?: SourceQuote; available?: QuoteChargeAvailability; existing?: ExistingInvoice & { id: string } }
function setupPrefill(initialProps: PrefillProps = {}) {
  return renderHook(({ quote, available, existing }: PrefillProps) => {
    const form = useForm<InvoiceFormValues>({ defaultValues: buildEmptyInvoiceValues() });
    useInvoicePrefill({ form, existing, sourceQuote: quote, chargeAvailability: available, isEdit: !!existing, assignments: [], forklifts: [], customers: [] });
    const handlers = useInvoiceLineItemHandlers(form, {
      key: existing ? `invoice:${existing.id}` : `quote:${quoteId}`, quoteId,
      quoteType: quote?.quote_type, originalLines: existing?.line_items ?? quote?.line_items,
    });
    return { form, handlers };
  }, { initialProps });
}

describe("sale SAT prefill with real form state", () => {
  it.each([
    { clave_prod_serv: "24101603", clave_unidad: "H87" },
    { clave_prod_serv: "24101603", clave_unidad: "" },
    { clave_prod_serv: "", clave_unidad: "H87" },
    { clave_prod_serv: "", clave_unidad: "" },
  ])("prefills supplied sale fields and keeps future additions explicit: %j", async (sat) => {
    const { result } = setupPrefill({ quote: { id: quoteId, customer_id: "customer", quote_type: "sale", line_items: [{ ...sale, ...sat }] }, available: availability });
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(1));
    expect(result.current.form.getValues("lineItems.0")).toMatchObject(sat);
    act(() => result.current.handlers.removeLineItem(0));
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
  });

  it("keeps rows entered while the quote is loading when sale prefill arrives and refetches", async () => {
    const { result, rerender } = setupPrefill();
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.0"));
    act(() => result.current.handlers.updateLineItem(0, "description", "Partida capturada durante carga"));
    act(() => result.current.handlers.updateLineItem(0, "clave_prod_serv", "custom-code"));
    const entered = result.current.form.getValues("lineItems.0");
    const quote: SourceQuote = { id: quoteId, customer_id: "customer", quote_type: "sale", line_items: [sale] };
    rerender({ quote, available: availability });
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toHaveLength(2));
    expect(result.current.form.getValues("lineItems.1")).toEqual(entered);
    act(() => result.current.handlers.addLineItem());
    expectExplicit(result.current.form.getValues("lineItems.2"));
    rerender({ quote: structuredClone(quote), available: structuredClone(availability) });
    expect(result.current.form.getValues("lineItems")).toHaveLength(3);
    expect(result.current.form.getValues("lineItems.1")).toEqual(entered);
  });

  it("does not rewrite historical sale codes when hydrating an existing invoice", async () => {
    const historical = { ...sale, clave_prod_serv: "78181500", clave_unidad: "DAY" };
    const { result } = setupPrefill({ existing: { id: "old-invoice", customer_id: "customer", line_items: [historical] } });
    await waitFor(() => expect(result.current.form.getValues("lineItems")).toEqual([historical]));
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0")).toEqual(historical);
    expectExplicit(result.current.form.getValues("lineItems.1"));
  });
});
