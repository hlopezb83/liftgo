import { describe, it, expect } from "vitest";
import { prorateDepreciation } from "../depreciation";

describe("prorateDepreciation (BL-18)", () => {
  it("cobra un mes completo cuando la renta cubre los 31 días", () => {
    // 480,000 / 48 = 10,000 por mes
    expect(prorateDepreciation(480_000, 31, 31)).toBe(10_000);
  });

  it("prorratea 1 día en un mes frontera de 31 días", () => {
    // 10,000 * (1/31) = 322.58
    expect(prorateDepreciation(480_000, 1, 31)).toBe(322.58);
  });

  it("prorratea 15 días en febrero (28 días)", () => {
    // 10,000 * (15/28) = 5357.14
    expect(prorateDepreciation(480_000, 15, 28)).toBe(5357.14);
  });

  it("devuelve 0 cuando el costo de adquisición es nulo o 0", () => {
    expect(prorateDepreciation(null, 30, 30)).toBe(0);
    expect(prorateDepreciation(0, 30, 30)).toBe(0);
    expect(prorateDepreciation(-100, 30, 30)).toBe(0);
  });

  it("devuelve 0 con días rentados inválidos", () => {
    expect(prorateDepreciation(480_000, 0, 31)).toBe(0);
    expect(prorateDepreciation(480_000, -5, 31)).toBe(0);
  });

  it("cap a daysInMonth si rentedDays lo excede", () => {
    // Si por algún motivo llegan 40 días de un mes de 30, tratar como mes completo
    expect(prorateDepreciation(480_000, 40, 30)).toBe(10_000);
  });
});
