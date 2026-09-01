import { describe, it, expect } from "vitest";

import { isFxMissing as isFxMissingCanonical } from "@/features/cash-flow";
import { amountInMxn, countFxMissing, isFxMissing } from "../collectionForecast";

describe("H-2 · facturas en divisa sin tipo de cambio", () => {
  it("no suma USD como si fueran pesos", () => {
    const usdSinTc = { total: 1000, balance: 1000, moneda: "USD", tipo_cambio: null };
    expect(isFxMissing(usdSinTc)).toBe(true);
    expect(amountInMxn(usdSinTc)).toBe(0);
  });

  it("convierte cuando hay tipo de cambio", () => {
    const usd = { total: 100, balance: 100, moneda: "USD", tipo_cambio: 18 };
    expect(isFxMissing(usd)).toBe(false);
    expect(amountInMxn(usd)).toBe(1800);
  });

  it("prefiere balance_mxn del servidor", () => {
    expect(amountInMxn({ total: 100, balance: 100, balance_mxn: 1750, moneda: "USD", tipo_cambio: 17.5 })).toBe(1750);
  });

  it("respeta la bandera fx_missing de la vista", () => {
    expect(amountInMxn({ total: 100, balance: 100, balance_mxn: 100, moneda: "USD", fx_missing: true })).toBe(0);
  });

  it("MXN nunca se marca como faltante de tipo de cambio", () => {
    expect(isFxMissing({ total: 500, balance: 500, moneda: "MXN", tipo_cambio: null })).toBe(false);
    expect(amountInMxn({ total: 500, balance: 500, moneda: null, tipo_cambio: null })).toBe(500);
  });

  it("cuenta los documentos excluidos", () => {
    expect(
      countFxMissing([
        { total: 1, balance: 1, moneda: "USD", tipo_cambio: null },
        { total: 1, balance: 1, moneda: "USD", tipo_cambio: 0 },
        { total: 1, balance: 1, moneda: "MXN" },
      ]),
    ).toBe(2);
  });
});

describe("R9-10 · paridad con el helper canónico de cash-flow", () => {
  const casos: Array<[string, number | null, boolean]> = [
    ["MXN", null, false],
    ["MXN", 1, false],
    ["USD", null, true],
    ["USD", 0, true],
    ["USD", 1, true],
    ["USD", -5, true],
    ["USD", 18.5, false],
    ["EUR", 20, false],
  ];

  it.each(casos)("%s con TC %s coincide con la regla canónica", (moneda, tc, esperado) => {
    expect(isFxMissing({ total: 100, balance: 100, moneda, tipo_cambio: tc })).toBe(esperado);
    expect(isFxMissingCanonical(moneda, tc)).toBe(esperado);
  });

  it("la bandera fx_missing de la vista sigue mandando aunque el TC sea válido", () => {
    expect(isFxMissing({ total: 100, balance: 100, moneda: "USD", tipo_cambio: 18, fx_missing: true })).toBe(true);
  });
});
