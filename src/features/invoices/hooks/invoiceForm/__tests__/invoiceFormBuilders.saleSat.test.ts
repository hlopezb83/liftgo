import { describe, expect, it } from "vitest";
import type { LineItemValues } from "../../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../../lib/quoteChargeAvailability";
import { buildFromInvoice, buildFromQuote, type SourceQuote } from "../invoiceFormBuilders";

const quoteId = "11111111-1111-4111-8111-111111111111";
const chargeId = "22222222-2222-4222-8222-222222222222";
const line: LineItemValues = { description: "Equipo", quantity: 1, unit_price: 1000, total: 1000 };
function fromQuote(overrides: Partial<SourceQuote>) {
  return buildFromQuote({
    q: { customer_id: "customer", line_items: [line], ...overrides },
    assignments: [], forklifts: [], customers: [],
  });
}

describe("invoice quote SAT defaults", () => {
  it.each([
    { quote_type: "sale", line_items: [line] },
    { quote_type: "rental", line_items: [{ ...line, line_kind: "sale" }] },
    { line_items: [{ ...line, line_kind: "sale" }] },
  ])("never infers rental codes for sale context: %j", (quote) => {
    expect(fromQuote(quote).lineItems[0]).toMatchObject({ clave_prod_serv: "", clave_unidad: "", objeto_imp: "02" });
    expect(line).not.toHaveProperty("clave_prod_serv");
  });

  it.each([
    { clave_prod_serv: "24101603", clave_unidad: "H87" },
    { clave_prod_serv: "24101603", clave_unidad: "" },
    { clave_prod_serv: "", clave_unidad: "H87" },
    { clave_prod_serv: "", clave_unidad: "" },
    { clave_prod_serv: "   ", clave_unidad: " " },
    // Presence is not proof of SAT catalog validity or manual provenance.
    { clave_prod_serv: "78181500", clave_unidad: "DAY" },
    { clave_prod_serv: "custom-unverified", clave_unidad: "ZZZ" },
  ])("preserves supplied sale SAT fields exactly: %j", (sat) => {
    expect(fromQuote({ quote_type: "sale", line_items: [{ ...line, ...sat }] }).lineItems[0]).toMatchObject(sat);
  });

  it.each([
    { clave_prod_serv: "24101603", expected: { clave_prod_serv: "24101603", clave_unidad: "" } },
    { clave_unidad: "H87", expected: { clave_prod_serv: "", clave_unidad: "H87" } },
  ])("does not complete a partial sale code pair: %j", ({ expected, ...sat }) => {
    expect(fromQuote({ quote_type: "sale", line_items: [{ ...line, ...sat }] }).lineItems[0]).toMatchObject(expected);
  });

  it("retains rental defaults and explicit rental codes", () => {
    expect(fromQuote({ quote_type: "rental" }).lineItems[0]).toMatchObject({ clave_prod_serv: "78181500", clave_unidad: "DAY" });
    expect(fromQuote({ quote_type: "rental", line_items: [{ ...line, clave_prod_serv: "78181501", clave_unidad: "MON" }] }).lineItems[0])
      .toMatchObject({ clave_prod_serv: "78181501", clave_unidad: "MON" });
  });

  it("does not default codes when a persisted quote has no confirmed type", () => {
    const form = buildFromQuote({ q: { id: quoteId, customer_id: "customer", line_items: [line] },
      assignments: [], forklifts: [], customers: [],
      chargeAvailability: { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] },
    });
    expect(form.lineItems[0]).toMatchObject({ clave_prod_serv: "", clave_unidad: "" });
  });

  it("enriches assigned sale descriptions without adding rental SAT codes", () => {
    const form = buildFromQuote({ q: { quote_type: "sale", customer_id: "customer", line_items: [line] },
      assignments: [{ line_index: 0, forklift_id: "forklift" }],
      forklifts: [{ id: "forklift", name: "QA", model: "F50", manufacturer: "Maker", serial_number: "TEST-1" }], customers: [],
    });
    expect(form.lineItems[0]).toMatchObject({ description: "Maker F50 — Venta de equipo (QA) (Serie: TEST-1)", clave_prod_serv: "", clave_unidad: "" });
  });

  it.each([
    { clave_prod_serv: "78101801", clave_unidad: "E51" },
    { clave_prod_serv: undefined, clave_unidad: undefined },
  ])("keeps dedicated logistics source codes and existing defaults: %j", (sat) => {
    const charge: LineItemValues = { ...line, description: "Entrega", line_kind: "charge", charge_kind: "logistics", quote_line_id: chargeId, ...sat };
    const chargeAvailability: QuoteChargeAvailability = { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false,
      lines: [{ quote_line_id: chargeId, line: charge, quoted_quantity: 1, consumed_quantity: 0, remaining_quantity: 1 }],
    }] };
    const form = buildFromQuote({ q: { id: quoteId, quote_type: "sale", customer_id: "customer", line_items: [line, charge] },
      assignments: [], forklifts: [], customers: [], chargeAvailability,
    });
    expect(form.lineItems[0]).toMatchObject({ clave_prod_serv: "", clave_unidad: "" });
    expect(form.lineItems[1]).toMatchObject({ line_kind: "charge", source_quote_id: quoteId, source_quote_line_id: chargeId,
      clave_prod_serv: sat.clave_prod_serv ?? "78101800", clave_unidad: sat.clave_unidad ?? "E48" });
  });

  it("leaves every historical line unchanged, including missing and rental-looking sale codes", () => {
    const historical = [line, { ...line, line_kind: "sale" as const },
      { ...line, line_kind: "sale" as const, clave_prod_serv: "78181500", clave_unidad: "DAY", extra_snapshot: "preserved" }];
    const snapshot = structuredClone(historical);
    const form = buildFromInvoice({ customer_id: "customer", line_items: historical }, []);
    expect(form.lineItems).toBe(historical);
    expect(form.lineItems).toEqual(snapshot);
  });
});
