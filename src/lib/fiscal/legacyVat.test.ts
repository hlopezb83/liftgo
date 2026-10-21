import { describe, expect, it } from "vitest";
import { hasLegacyVat, isNotObsoleteVat, legacyVatNeedsCorrection, sameFiscalLines } from "./legacyVat";
import { hasLegacyVat as serverHasLegacyVat, assertNoLegacyVat } from "../../../supabase/functions/_shared/legacyVat";
import { computeTotals } from "@/lib/domain/invoiceHelpers";
import { buildFromInvoice, buildFromQuote } from "@/features/invoices/hooks/invoiceForm/invoiceFormBuilders";
import { invoiceFormSchema, createInvoiceFormSchema } from "@/features/invoices/lib/invoiceFormSchema";

const line = { description: "Historical service", quantity: 1, unit_price: 100, total: 100, tax_rate: 11 };
describe("obsolete VAT only blocks new operations, never rewrites history", () => {
  it.each([11, "11", "11.00", "1.1e1"])("rejects legacy header and line rate %s in both runtimes", (rate) => {
    for (const document of [{ tax_rate: rate }, { tax_rate: 16, line_items: [{ ...line, tax_rate: rate }] }]) {
      expect(hasLegacyVat(document)).toBe(true);
      expect(serverHasLegacyVat(document)).toBe(true);
      expect(() => assertNoLegacyVat(document)).toThrow("11%");
    }
  });
  it.each([null, undefined, 0, 8, 16])("leaves non-legacy rates %s alone without endorsing eligibility", (rate) => {
    expect(isNotObsoleteVat(rate)).toBe(true);
    expect(serverHasLegacyVat({ tax_rate: rate })).toBe(false);
  });
  it("keeps historical calculations, loaded invoices and quote copies unchanged, but rejects new submission", () => {
    const source = { tax_rate: 11, line_items: [line], customer_id: "qa", customer_name: "QA", issued_at: "2013-01-01" };
    const before = JSON.stringify(source);
    const existing = buildFromInvoice(source, undefined);
    const copied = buildFromQuote({ q: source, assignments: undefined, forklifts: undefined, customers: undefined });
    expect(existing.taxRate).toBe(11);
    expect(copied.taxRate).toBe(11);
    expect(computeTotals([line], 11)).toMatchObject({ subtotal: 100, taxAmount: 11, total: 111 });
    expect(createInvoiceFormSchema(existing).safeParse({ ...existing, notes: "Reviewed" }).success).toBe(true);
    expect(legacyVatNeedsCorrection({tax_rate:11,line_items:[line]}, source)).toBe(false);
    for (const values of [existing, copied]) {
      const result = invoiceFormSchema.safeParse(values);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("11%"))).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(before);
  });
});

it("fiscal snapshot comparison preserves Date values and ignores only object key order", () => {
  const before = { taxRate: "11", dateRange: { from: new Date("2026-10-01"), to: new Date("2026-10-31") } };
  expect(sameFiscalLines(before, { dateRange: before.dateRange, taxRate: "11" })).toBe(true);
  expect(sameFiscalLines(before, { ...before, dateRange: { ...before.dateRange, to: new Date("2026-11-30") } })).toBe(false);
});
