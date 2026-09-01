import { describe, expect, it } from "vitest";

import { DEFAULT_VAT_RATE_PERCENT, resolveVatRatePercent } from "@/lib/money";

/**
 * R9-14 · una sola definición de "qué IVA aplicar" para el preview de la UI y
 * para la Edge Function que genera las facturas recurrentes.
 *
 * La trampa original: `Number(null)` es `0`, así que un cliente sin tasa
 * capturada se facturaba al 0% (como si estuviera exento) sin que nadie lo
 * pidiera. Ahora "sin dato" y "0% explícito" son cosas distintas.
 */
describe("R9-14 · resolveVatRatePercent", () => {
  it("sin dato usa el IVA por omisión", () => {
    expect(DEFAULT_VAT_RATE_PERCENT).toBe(16);
    expect(resolveVatRatePercent(null)).toBe(16);
    expect(resolveVatRatePercent(undefined)).toBe(16);
    expect(resolveVatRatePercent(Number.NaN)).toBe(16);
    expect(resolveVatRatePercent("no-es-numero")).toBe(16);
    expect(resolveVatRatePercent(Number.POSITIVE_INFINITY)).toBe(16);
  });

  it("0% explícito es una tasa válida y NO se reemplaza", () => {
    expect(resolveVatRatePercent(0)).toBe(0);
    expect(resolveVatRatePercent("0")).toBe(0);
  });

  it("respeta cualquier tasa capturada dentro de rango", () => {
    expect(resolveVatRatePercent(16)).toBe(16);
    expect(resolveVatRatePercent("8")).toBe(8);
    expect(resolveVatRatePercent(100)).toBe(100);
  });

  it("una tasa fuera de rango cae al valor por omisión", () => {
    expect(resolveVatRatePercent(-1)).toBe(16);
    expect(resolveVatRatePercent(101)).toBe(16);
  });

  it("preview y generación coinciden para el mismo cliente", () => {
    const subtotal = 10_000;
    for (const rate of [null, undefined, Number.NaN, 0, 8, 16] as const) {
      const preview = subtotal * (resolveVatRatePercent(rate) / 100);
      const generado = subtotal * (resolveVatRatePercent(rate) / 100);
      expect(preview).toBe(generado);
    }
  });
});
