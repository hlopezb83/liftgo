import currency from "currency.js";
import { describe, expect, it } from "vitest";
import { proratedMonthlyAmount, proratedMonthlyCents } from "../invoiceTotals";

describe("monthly recurring amount preserves existing cents contract", () => {
  it.each([0, 0.005, 0.01, 1.005, 99.99, 1000.999, 12345.67, 999999.99])("matches the original formula for rate %s across calendar months", (rate) => {
    for (const daysInMonth of [28, 29, 30, 31]) {
      for (let billedDays = 1; billedDays <= daysInMonth; billedDays += 1) {
        const originalCents = Math.round(currency(rate).intValue * billedDays / daysInMonth);
        expect(proratedMonthlyCents(rate, billedDays, daysInMonth)).toBe(originalCents);
        expect(proratedMonthlyAmount(rate, billedDays, daysInMonth)).toBe(originalCents / 100);
      }
    }
  });
  it("preserves the cent tie rule and the monthly-rate normalization", () => {
    expect(proratedMonthlyCents(0.01, 15, 30)).toBe(1);
    expect(proratedMonthlyAmount(1000.999, 31, 31)).toBe(1001);
    expect(proratedMonthlyAmount(99.99, 10, 30)).toBe(33.33);
  });
});
