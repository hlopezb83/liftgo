import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";

describe("formatCurrency", () => {
  it("formatea como MXN es-MX con 2 decimales", () => {
    const r = formatCurrency(1234.5);
    expect(r).toMatch(/1,234\.50/);
    expect(r).toMatch(/\$/);
  });

  it("maneja cero", () => {
    expect(formatCurrency(0)).toMatch(/0\.00/);
  });

  it("redondea a 2 decimales", () => {
    expect(formatCurrency(10.005)).toMatch(/10\.0[01]/);
  });
});

describe("formatCurrencyWithCode", () => {
  it("usa USD cuando se especifica", () => {
    const r = formatCurrencyWithCode(100, "USD");
    expect(r).toMatch(/100\.00/);
  });

  it("default MXN", () => {
    const r = formatCurrencyWithCode(50);
    expect(r).toMatch(/50\.00/);
  });
});
