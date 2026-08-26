import { describe, it, expect } from "vitest";
import { computeMatchScore } from "../matchingScore";

describe("computeMatchScore", () => {
  const base = {
    paymentAmount: 1000,
    lineAmount: 1000,
    paymentDate: "2026-06-01",
    lineDate: "2026-06-01",
    paymentReference: "REF001",
    lineText: "TRANSFERENCIA REF001 ACME",
  };

  it("match exacto con referencia → 100", () => {
    expect(computeMatchScore(base)).toBe(100);
  });

  it("monto exacto + fecha exacta sin referencia → 85", () => {
    expect(
      computeMatchScore({ ...base, paymentReference: null, lineText: null }),
    ).toBe(85);
  });

  it("3 días de diferencia + referencia parcial → 76", () => {
    // 60 + max(0, 25 - 3*8) = 60 + 1 = 61; + 15 ref = 76
    expect(
      computeMatchScore({ ...base, lineDate: "2026-06-04" }),
    ).toBe(76);
  });

  it("monto distinto fuera de tolerancia → 0", () => {
    expect(computeMatchScore({ ...base, lineAmount: 1001 })).toBe(0);
  });

  it("diferencia de fecha > 3 días → 0", () => {
    expect(computeMatchScore({ ...base, lineDate: "2026-06-10" })).toBe(0);
  });

  it("tolerancia de monto 0.01 acepta diferencias mínimas", () => {
    expect(computeMatchScore({ ...base, lineAmount: 1000.01 })).toBe(100);
  });

  it("referencia que no aparece en el texto no suma 15", () => {
    expect(
      computeMatchScore({ ...base, lineText: "PAGO SIN REFERENCIA" }),
    ).toBe(85);
  });
});

describe("computeMatchScore · FX bidireccional (R4-11)", () => {
  const base = {
    paymentDate: "2026-06-01",
    lineDate: "2026-06-01",
    paymentReference: "REF001",
    lineText: "TRANSFERENCIA REF001 ACME",
  };

  it("pago MXN contra cuenta USD divide entre el tipo de cambio", () => {
    // 17,500 MXN / 17.50 = 1,000 USD
    expect(
      computeMatchScore({
        ...base,
        paymentAmount: 17_500,
        lineAmount: 1000,
        paymentCurrency: "MXN",
        accountCurrency: "USD",
        paymentExchangeRate: 17.5,
      }),
    ).toBe(100);
  });

  it("pago USD contra cuenta MXN sigue multiplicando", () => {
    expect(
      computeMatchScore({
        ...base,
        paymentAmount: 1000,
        lineAmount: 17_500,
        paymentCurrency: "USD",
        accountCurrency: "MXN",
        paymentExchangeRate: 17.5,
      }),
    ).toBe(100);
  });

  it("redondea a 2 decimales antes de aplicar la tolerancia", () => {
    // 1000 / 3 = 333.333... → 333.33 (dentro de la tolerancia de 0.01)
    expect(
      computeMatchScore({
        ...base,
        paymentAmount: 1000,
        lineAmount: 333.33,
        paymentCurrency: "MXN",
        accountCurrency: "USD",
        paymentExchangeRate: 3,
      }),
    ).toBe(100);
  });

  it("sin tipo de cambio entre monedas distintas no matchea", () => {
    expect(
      computeMatchScore({
        ...base,
        paymentAmount: 17_500,
        lineAmount: 1000,
        paymentCurrency: "MXN",
        accountCurrency: "USD",
        paymentExchangeRate: null,
      }),
    ).toBe(0);
  });
});
