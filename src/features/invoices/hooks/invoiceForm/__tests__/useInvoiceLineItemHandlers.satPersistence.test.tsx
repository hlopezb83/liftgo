import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
// Test-only bridge to the real pure mapper. No handler, Deno runtime or network.
import { buildInvoicePayload } from "../../../../../../supabase/functions/stamp-cfdi/invoicePayload";
import { buildEmptyInvoiceValues, invoiceFormSchema, lineItemSchema, type InvoiceFormValues, type LineItemValues } from "../../../lib/invoiceFormSchema";
import { toLineItems } from "../../../lib/invoiceLineSerialization";
import { buildFromInvoice, buildFromQuote } from "../invoiceFormBuilders";
import type { InvoiceLineItemSource } from "../invoiceSatDefaults";
import { useInvoiceLineItemHandlers } from "../useInvoiceLineItemHandlers";

const quoteId = "11111111-1111-4111-8111-111111111111";
const original: LineItemValues = { description: "Origen histórico", quantity: 1, unit_price: 100, total: 100,
  source_quote_id: quoteId, source_quote_line_id: "22222222-2222-4222-8222-222222222222",
  clave_prod_serv: "78101800", clave_unidad: "E48" };
function setup(lines: LineItemValues[], source: InvoiceLineItemSource = {}) {
  return renderHook(({ source }) => {
    const form = useForm<InvoiceFormValues>({ defaultValues: { ...buildEmptyInvoiceValues(), customerId: "customer", lineItems: lines } });
    return { form, handlers: useInvoiceLineItemHandlers(form, source) };
  }, { initialProps: { source } });
}
function fillDraft(result: ReturnType<typeof setup>["result"], index: number) {
  act(() => result.current.handlers.updateLineItem(index, "description", "Partida manual nueva"));
  act(() => result.current.handlers.updateLineItem(index, "unit_price", 100));
}
function expectFlaggedManual(line: LineItemValues) {
  expect(line).toMatchObject({ line_kind: "manual", sat_selection_required: true, clave_prod_serv: "", clave_unidad: "" });
  expect(line.source_quote_id).toBeUndefined();
  expect(line.source_quote_line_id).toBeUndefined();
}
function savedInvoice(values: InvoiceFormValues) {
  const parsed = invoiceFormSchema.parse(values);
  return JSON.parse(JSON.stringify({ customer_id: parsed.customerId, line_items: toLineItems(parsed.lineItems), tax_rate: parsed.taxRate,
    receptor_rfc: "AAA010101AA1", receptor_razon_social: "Empresa QA", receptor_regimen_fiscal: "601", receptor_domicilio_fiscal_cp: "64000", moneda: "MXN" }));
}
function expectPayloadBlocked(invoice: Record<string, unknown>) {
  const built = buildInvoicePayload({ invoiceId: "invoice-qa", invoice });
  expect(built).toMatchObject({ ok: false, status: 422 });
  if (!built.ok) expect(built.error).toContain("Selecciona explícitamente");
}

describe("persistent SAT selection for unresolved invoice origins", () => {
  it.each([false, true])("preserves the gate through schema → DTO → rehydration (delete source before add=%s)", (deleteFirst) => {
    const first = setup([original]);
    if (deleteFirst) act(() => first.result.current.handlers.removeLineItem(0));
    act(() => first.result.current.handlers.addLineItem());
    if (!deleteFirst) act(() => first.result.current.handlers.removeLineItem(0));
    fillDraft(first.result, 0);
    expectFlaggedManual(first.result.current.form.getValues("lineItems.0"));

    const parsed = invoiceFormSchema.parse(first.result.current.form.getValues());
    const serialized = toLineItems(parsed.lineItems);
    expect(serialized[0].sat_selection_required).toBe(true);
    expectPayloadBlocked(savedInvoice(first.result.current.form.getValues()));
    expect(original).not.toHaveProperty("sat_selection_required");
    first.unmount();

    const restored = buildFromInvoice({ customer_id: "customer", line_items: JSON.parse(JSON.stringify(serialized)) }, []);
    const second = setup(restored.lineItems); // No quote ID, source metadata or sale kind.
    expectFlaggedManual(second.result.current.form.getValues("lineItems.0"));
    act(() => second.result.current.handlers.removeLineItem(0));
    act(() => second.result.current.handlers.addLineItem());
    expectFlaggedManual(second.result.current.form.getValues("lineItems.0"));
    fillDraft(second.result, 0);
    expectPayloadBlocked(savedInvoice(second.result.current.form.getValues()));
  });

  it("keeps true while editing fields, selecting SAT codes and clearing them again", () => {
    const { result } = setup([], { quoteId });
    act(() => result.current.handlers.addLineItem());
    fillDraft(result, 0);
    act(() => result.current.handlers.updateLineItem(0, "clave_prod_serv", "24101603"));
    act(() => result.current.handlers.updateLineItem(0, "clave_unidad", "H87"));
    const serialized = toLineItems(invoiceFormSchema.parse(result.current.form.getValues()).lineItems);
    expect(serialized[0].sat_selection_required).toBe(true);
    act(() => result.current.handlers.updateLineItem(0, "quantity", 2));
    act(() => result.current.handlers.updateLineItem(0, "clave_prod_serv", ""));
    act(() => result.current.handlers.updateLineItem(0, "clave_unidad", ""));
    expectFlaggedManual(result.current.form.getValues("lineItems.0"));
    expect(result.current.form.getValues("lineItems.0.total")).toBe(200);
  });

  it("keeps the persisted requirement after the source resolves as rental without inferring sale", () => {
    const { result, rerender } = setup([], { key: "same", quoteId });
    act(() => result.current.handlers.addLineItem());
    rerender({ source: { key: "same", quoteId, quoteType: "rental" } });
    act(() => result.current.handlers.removeLineItem(0));
    act(() => result.current.handlers.addLineItem());
    expectFlaggedManual(result.current.form.getValues("lineItems.0"));
  });

  it("resets the independent SAT latch when a new source is a confirmed rental", () => {
    const { result, rerender } = setup([], { key: "unknown", quoteId });
    act(() => result.current.handlers.addLineItem());
    act(() => result.current.handlers.removeLineItem(0));
    rerender({ source: { key: "rental", quoteId, quoteType: "rental" } });
    act(() => result.current.handlers.addLineItem());
    const line = result.current.form.getValues("lineItems.0");
    expect(line).toMatchObject({ line_kind: "manual", clave_prod_serv: "78181500", clave_unidad: "DAY" });
    expect(line).not.toHaveProperty("sat_selection_required");
  });

  it("does not add the marker to legacy/rental rows, or use false to override sale context", () => {
    const historical = lineItemSchema.parse({ description: "Renta", quantity: 1, unit_price: 100, total: 100 });
    expect(toLineItems([historical])[0]).not.toHaveProperty("sat_selection_required");
    const { result } = setup([{ ...historical, line_kind: "sale", sat_selection_required: false }]);
    act(() => result.current.handlers.addLineItem());
    expect(result.current.form.getValues("lineItems.0.sat_selection_required")).toBe(false);
    expect(result.current.form.getValues("lineItems.1")).toMatchObject({ line_kind: "sale", sat_selection_required: true, clave_prod_serv: "", clave_unidad: "" });
  });

  it("honors an already marked quote line without reclassifying it as sale", () => {
    const line = { description: "Manual", quantity: 1, unit_price: 100, total: 100, line_kind: "manual", sat_selection_required: true };
    const form = buildFromQuote({ q: { customer_id: "customer", quote_type: "rental", line_items: [line] }, assignments: [], forklifts: [], customers: [] });
    expectFlaggedManual(form.lineItems[0]);
  });

  it("maps a saved/reopened known rental without adding a requirement", () => {
    const { result } = setup([], { quoteId, quoteType: "rental" });
    act(() => result.current.handlers.addLineItem());
    fillDraft(result, 0);
    const invoice = savedInvoice(result.current.form.getValues());
    const reopened = buildFromInvoice(invoice, []);
    expect(reopened.lineItems[0]).not.toHaveProperty("sat_selection_required");
    const built = buildInvoicePayload({ invoiceId: "invoice-qa", invoice });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.payload.items).toMatchObject([{ product: { product_key: "78181500", unit_key: "DAY" } }]);
  });

  it("blocks a new unlinked row in a saved mixed invoice, then preserves selected and original codes", () => {
    const rental: LineItemValues = { description: "Renta", line_kind: "rental", quantity: 1, unit_price: 500, total: 500,
      clave_prod_serv: "78181500", clave_unidad: "DAY" };
    const first = setup([original, rental]);
    act(() => first.result.current.handlers.addLineItem());
    fillDraft(first.result, 2);
    const invoice = savedInvoice(first.result.current.form.getValues());
    expectPayloadBlocked(invoice);
    first.unmount();
    const reopened = buildFromInvoice(invoice, []);
    const second = setup(reopened.lineItems);
    act(() => second.result.current.handlers.updateLineItem(2, "clave_prod_serv", "24101603"));
    act(() => second.result.current.handlers.updateLineItem(2, "clave_unidad", "H87"));
    const selected = savedInvoice(second.result.current.form.getValues());
    expect(selected.line_items[2]).toMatchObject({ line_kind: "manual", sat_selection_required: true });
    expect(selected.line_items[0]).not.toHaveProperty("sat_selection_required");
    expect(selected.line_items[1]).not.toHaveProperty("sat_selection_required");
    const built = buildInvoicePayload({ invoiceId: "invoice-qa", invoice: selected, saleSatContext: { saleSourceQuoteIds: [quoteId] } });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.payload.items).toMatchObject([
      { product: { product_key: "78101800", unit_key: "E48" } },
      { product: { product_key: "78181500", unit_key: "DAY" } },
      { product: { product_key: "24101603", unit_key: "H87" } },
    ]);
    expect(original).not.toHaveProperty("sat_selection_required");
  });

  it.each(["true", "false", 1, 0, null, {}, []])("rejects a nonboolean marker instead of coercing it: %j", (marker) => {
    const result = lineItemSchema.safeParse({ description: "Manual", quantity: 1, unit_price: 100, total: 100, sat_selection_required: marker });
    expect(result.success).toBe(false);
  });
});
