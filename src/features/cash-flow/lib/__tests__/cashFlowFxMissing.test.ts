// FIX-14: FX faltante en documentos foráneos → excluidos del cash-flow en
// vez de proyectarse 1:1 (subestimación silenciosa).
import { describe, it, expect } from "vitest";
import { isFxMissing, invoiceToItem, billToItem } from "../cashFlowTransformers";

describe("isFxMissing", () => {
  it("detecta FX faltante para moneda foránea", () => {
    expect(isFxMissing("USD", null)).toBe(true);
    expect(isFxMissing("USD", 0)).toBe(true);
    expect(isFxMissing("USD", "abc")).toBe(true);
  });
  it("FX válido para moneda foránea no está faltante", () => {
    expect(isFxMissing("USD", 17.5)).toBe(false);
  });
  it("MXN nunca está faltante, con o sin moneda explícita", () => {
    expect(isFxMissing("MXN", null)).toBe(false);
    expect(isFxMissing(null, null)).toBe(false);
  });
});

describe("invoiceToItem con FX faltante", () => {
  it("excluye la factura foránea sin tipo de cambio", () => {
    const item = invoiceToItem({
      id: "i2", invoice_number: "FAC-002", total: 1000,
      due_date: "2026-07-01", customer_name: "Acme",
      moneda: "USD", tipo_cambio: null, credited_amount: null,
      balance_mxn: null,
    });
    expect(item).toBeNull();
  });
});

describe("billToItem con FX faltante", () => {
  it("excluye la cuenta por pagar foránea sin tipo de cambio", () => {
    const item = billToItem({
      id: "b5", bill_number: "B-5", balance: 100, due_date: "2026-07-01",
      currency: "USD", exchange_rate: null, suppliers: { name: "Prov5" },
    });
    expect(item).toBeNull();
  });
});
