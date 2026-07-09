import { describe, it, expect } from "vitest";
import { toMxn, roundMoney, sumMoney } from "../money";

describe("money — toMxn", () => {
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
  it("con fx null/undefined devuelve el monto original", () => {
    expect(toMxn(50, "USD", null)).toBe(50);
    expect(toMxn(50, "USD", undefined)).toBe(50);
  });
  it("con fx no numérico devuelve el monto original", () => {
    expect(toMxn(50, "USD", "abc")).toBe(50);
  });
  it("es case-insensitive para el código de moneda", () => {
    expect(toMxn(10, "usd", 17)).toBe(170);
    expect(toMxn(10, "mxn", 17)).toBe(10);
  });
});

describe("money — roundMoney", () => {
  it("redondea a 2 decimales", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it("null/undefined/NaN → 0", () => {
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney(NaN)).toBe(0);
  });
});

describe("money — sumMoney", () => {
  it("suma y redondea, ignorando null/undefined/NaN", () => {
    expect(sumMoney([0.1, 0.2, null, undefined, NaN])).toBe(0.3);
  });
});
