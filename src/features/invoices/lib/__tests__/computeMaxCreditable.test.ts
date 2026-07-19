import { describe, expect, it } from "vitest";
import { computeMaxCreditable } from "../computeMaxCreditable";

describe("computeMaxCreditable (BL-08 v7.90.0)", () => {
  it("factura sin créditos → max = total", () => {
    expect(computeMaxCreditable(1000, 0, 0)).toBe(1000);
  });

  it("factura pagada al 100% (los pagos no reducen el tope)", () => {
    // Antes del fix: 1000 - 1000 - 0 - 0 = 0 → botón deshabilitado.
    // Ahora: 1000, se permite emitir NC por devolución/bonificación.
    expect(computeMaxCreditable(1000, 0, 0)).toBe(1000);
  });

  it("con NC activa → resta acreditado", () => {
    expect(computeMaxCreditable(1000, 300, 0)).toBe(700);
  });

  it("con borrador de NC → resta borradores también", () => {
    expect(computeMaxCreditable(1000, 200, 150)).toBe(650);
  });

  it("valores no numéricos coerción segura", () => {
    expect(computeMaxCreditable(Number("abc"), 0, 0)).toBe(0);
  });
});
