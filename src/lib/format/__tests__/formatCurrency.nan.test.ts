import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyWithCode } from "../formatCurrency";

describe("formatCurrency — Bloque 5.3 (R4) NaN/null guards", () => {
  it("formatea números finitos normalmente", () => {
    expect(formatCurrency(1234.5)).toContain("1,234.50");
    expect(formatCurrency(0)).toContain("0.00");
  });

  it("devuelve '—' para NaN", () => {
    expect(formatCurrency(Number.NaN)).toBe("—");
  });

  it("devuelve '—' para null y undefined", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("devuelve '—' para Infinity y -Infinity", () => {
    expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatCurrency(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("formatCurrencyWithCode aplica los mismos guards", () => {
    expect(formatCurrencyWithCode(null, "USD")).toBe("—");
    expect(formatCurrencyWithCode(Number.NaN, "USD")).toBe("—");
    expect(formatCurrencyWithCode(100, "USD")).toContain("100.00");
  });
});
