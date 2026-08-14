import { describe, expect, it } from "vitest";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceTotals";

/**
 * S2-2.3: `computeTotals` debe gravar línea por línea respetando `objeto_imp`.
 * Los resultados deben coincidir centavo a centavo con el payload que arma
 * `supabase/functions/stamp-cfdi/handler.ts` (líneas objeto 01 → `taxes: []`).
 */
const line = (over: Partial<LineItem>): LineItem => ({
  description: "Partida",
  quantity: 1,
  unit_price: over.total ?? 0,
  total: 0,
  ...over,
});

describe("computeTotals — objeto_imp por línea", () => {
  it("factura mixta: renta 02 grava IVA, partida 01 no", () => {
    const r = computeTotals(
      [
        line({ total: 10_000, objeto_imp: "02" }),
        line({ total: 2_000, objeto_imp: "01" }),
      ],
      16,
    );
    expect(r.subtotal).toBe(12_000);
    expect(r.taxAmount).toBe(1_600);
    expect(r.total).toBe(13_600);
  });

  it("factura 100% no objeto de impuesto: IVA = 0", () => {
    const r = computeTotals(
      [line({ total: 5_000, objeto_imp: "01" }), line({ total: 1_234.56, objeto_imp: "01" })],
      16,
    );
    expect(r.subtotal).toBe(6_234.56);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(6_234.56);
  });

  it("factura normal sin objeto_imp: grava todo con la tasa global", () => {
    const r = computeTotals([line({ total: 1_000 }), line({ total: 500 })], 16);
    expect(r.subtotal).toBe(1_500);
    expect(r.taxAmount).toBe(240);
    expect(r.total).toBe(1_740);
  });

  it("respeta tax_rate por línea cuando existe", () => {
    const r = computeTotals(
      [line({ total: 1_000, tax_rate: 8 }), line({ total: 1_000 })],
      16,
    );
    expect(r.taxAmount).toBe(240);
    expect(r.total).toBe(2_240);
  });

  it("aplica el descuento antes del IVA y capea el porcentaje en 100%", () => {
    const r = computeTotals(
      [line({ total: 1_000, discount: 150, discount_type: "%" })],
      16,
    );
    expect(r.subtotal).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(0);
  });
});
