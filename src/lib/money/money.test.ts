import { describe, it, expect } from "vitest";
import { roundMoney, sumMoney, toMxn, applyVat, DEFAULT_VAT_RATE } from "@/lib/money";

describe("roundMoney", () => {
  it("removes binary tails from common float ops", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.345)).toBe(2.35);
  });

  it("handles negatives", () => {
    expect(roundMoney(-1.005)).toBe(-1);
    expect(roundMoney(-2.346)).toBe(-2.35);
  });

  it("returns 0 for non-finite or nullish inputs", () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
  });

  it("is idempotent on already-rounded values", () => {
    expect(roundMoney(1234.56)).toBe(1234.56);
    expect(roundMoney(roundMoney(0.1 + 0.2))).toBe(0.3);
  });
});

describe("sumMoney", () => {
  it("sums and rounds to 2 decimals", () => {
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumMoney([1.005, 2.005, 3.005])).toBe(6.02);
  });

  it("skips NaN/null/undefined entries", () => {
    expect(sumMoney([1.5, null, 2.5, undefined, NaN])).toBe(4);
  });

  it("handles empty arrays", () => {
    expect(sumMoney([])).toBe(0);
  });

  it("handles large arrays without drift", () => {
    const arr = Array.from({ length: 1000 }, () => 0.1);
    expect(sumMoney(arr)).toBe(100);
  });
});

describe("toMxn", () => {
  it("devuelve el monto sin conversión si moneda es MXN", () => {
    expect(toMxn(100, "MXN", 20)).toBe(100);
  });
  it("trata null/undefined como MXN por defecto", () => {
    expect(toMxn(100, null, 20)).toBe(100);
    expect(toMxn(100, undefined, 20)).toBe(100);
  });
  it("convierte USD a MXN multiplicando por fx", () => {
    expect(toMxn(10, "USD", 17.5)).toBe(175);
  });
  it("acepta fx como string numérico", () => {
    expect(toMxn(10, "USD", "17.5")).toBe(175);
  });
  it("con fx = 0 devuelve el monto original (NO colapsa a 0)", () => {
    expect(toMxn(50, "USD", 0)).toBe(50);
  });
  it("con fx null/undefined/no-numérico devuelve el monto original", () => {
    expect(toMxn(50, "USD", null)).toBe(50);
    expect(toMxn(50, "USD", undefined)).toBe(50);
    expect(toMxn(50, "USD", "abc")).toBe(50);
  });
  it("es case-insensitive para el código de moneda", () => {
    expect(toMxn(10, "usd", 17)).toBe(170);
    expect(toMxn(10, "mxn", 17)).toBe(10);
  });
});

describe("applyVat", () => {
  it("aplica la tasa por defecto (16%)", () => {
    expect(DEFAULT_VAT_RATE).toBe(0.16);
    expect(applyVat(100)).toBeCloseTo(116, 5);
  });
  it("acepta tasa custom", () => {
    expect(applyVat(100, 0.08)).toBeCloseTo(108, 5);
    expect(applyVat(100, 0)).toBe(100);
  });
});

