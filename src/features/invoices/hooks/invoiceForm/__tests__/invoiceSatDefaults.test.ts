import { describe, expect, it } from "vitest";
import { invoiceLineItemSource, requiresExplicitInvoiceSat } from "../invoiceSatDefaults";

const base = { quoteId: "quote-current", extensionId: null, damageId: null };

describe("invoice page SAT source context", () => {
  it("keeps quote identity while its type is loading", () => {
    const source = invoiceLineItemSource(base);
    expect(source.quoteId).toBe("quote-current");
    expect(source.quoteType).toBeUndefined();
    expect(requiresExplicitInvoiceSat(source, false)).toBe(true);
  });

  it("rejects a previous quote response as evidence of the current quote's type", () => {
    const source = invoiceLineItemSource({ ...base, quote: { id: "quote-previous", quote_type: "rental", line_items: [] } });
    expect(source.quoteType).toBeUndefined();
    expect(source.originalLines).toBeUndefined();
    expect(requiresExplicitInvoiceSat(source, false)).toBe(true);
  });

  it("uses a matching quote's confirmed type and original lines", () => {
    const lines = [{ line_kind: "sale" }];
    const source = invoiceLineItemSource({ ...base, quote: { id: "quote-current", quote_type: "sale", line_items: lines } });
    expect(source).toMatchObject({ quoteType: "sale", originalLines: lines });
  });

  it("keeps historical quote identity and rows without trusting from_quote search parameters", () => {
    const rows = [{ line_kind: "sale", clave_prod_serv: "78181500" }];
    const source = invoiceLineItemSource({ ...base, invoiceId: "invoice", existing: { quote_id: "historical-quote", line_items: rows },
      quote: { id: "quote-current", quote_type: "rental" } });
    expect(source).toMatchObject({ key: "invoice:invoice", quoteId: "historical-quote", originalLines: rows });
    expect(source.quoteType).toBeUndefined();
    expect(requiresExplicitInvoiceSat(source, false)).toBe(true);
  });

  it("does not assign defaults before an existing invoice has loaded", () => {
    const source = invoiceLineItemSource({ ...base, quoteId: null, invoiceId: "invoice", isLoadingInvoice: true });
    expect(requiresExplicitInvoiceSat(source, false)).toBe(true);
  });

  it("changes new draft source identity, but ignores unrelated quote parameters during editing", () => {
    const first = invoiceLineItemSource(base);
    expect(invoiceLineItemSource({ ...base, quoteId: "next" }).key).not.toBe(first.key);
    expect(invoiceLineItemSource({ ...base, extensionId: "next" }).key).not.toBe(first.key);
    expect(invoiceLineItemSource({ ...base, damageId: "next" }).key).not.toBe(first.key);
    expect(invoiceLineItemSource({ ...base, invoiceId: "invoice" }).key)
      .toBe(invoiceLineItemSource({ ...base, invoiceId: "invoice", quoteId: "next" }).key);
  });
});
