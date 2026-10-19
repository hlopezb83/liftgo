import { describe, expect, it } from "vitest";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { preserveQuoteChargeIdentities } from "../quoteChargeIdentity";
const generated: LineItem = { line_kind: "charge", charge_kind: "logistics", description: "Servicio de Logística", quantity: 1, unit_price: 100, total: 100 };
const original: LineItem = { ...generated, quote_line_id: "11111111-1111-4111-8111-111111111111", description: "Entrega convenida", quantity: 3, total: 300, discount: 15, discount_type: "%", tax_rate: 8, objeto_imp: "02" };
describe("preserveQuoteChargeIdentities", () => {
  it("preserves explicit identity, quantity and financial metadata when a structured quote is edited", () => {
    expect(preserveQuoteChargeIdentities([generated], [original])[0]).toEqual(original);
  });
  it("does not transfer identity based on descriptions or positions", () => {
    const withoutKind = { ...original, charge_kind: undefined };
    expect(preserveQuoteChargeIdentities([generated], [withoutKind])[0].quote_line_id).toBeUndefined();
    expect(preserveQuoteChargeIdentities([{ ...generated, charge_kind: "insurance" }], [original])[0].quote_line_id).toBeUndefined();
  });
  it("leaves new charges without fabricated IDs for authoritative server assignment, even when all old charges were removed", () => {
    expect(preserveQuoteChargeIdentities([], [original])).toEqual([]);
    expect(preserveQuoteChargeIdentities([generated], [])[0]).toEqual(generated);
    const saved = { ...generated, quote_line_id: "22222222-2222-4222-8222-222222222222" };
    expect(preserveQuoteChargeIdentities([generated], [saved])[0].quote_line_id).toBe(saved.quote_line_id);
  });
  it("blocks ambiguous structured charge identities", () => {
    expect(() => preserveQuoteChargeIdentities([generated], [original, { ...original, quote_line_id: "other" }])).toThrow(/varios cargos/);
  });
});
