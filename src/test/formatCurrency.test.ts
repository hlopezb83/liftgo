import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/format/formatCurrency";

describe("formatCurrency", () => {
  it("formats a positive number with two decimals", () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain("1,234.50");
    expect(result).toContain("$");
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("$");
    expect(result).toContain("0.00");
  });

  it("formats negative numbers", () => {
    const result = formatCurrency(-50);
    expect(result).toContain("50.00");
    expect(result).toContain("$");
  });

  it("rounds to two decimal places", () => {
    const result = formatCurrency(9.999);
    expect(result).toContain("10.00");
  });
});
