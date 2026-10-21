import { describe, expect, it } from "vitest";
import { roundConvertedAmount, roundPercentageAmount } from "./decimalRounding";
import { percentageCases } from "../../../tests/fixtures/monetaryEquivalence";
import { computeTotals } from "../domain/invoiceTotals";

describe("single-boundary percentage rounding without binary intermediate products", () => {
  it.each(percentageCases)("%s × %s percent = %s", (base, rate, expected) => {
    expect(roundPercentageAmount(base, rate)).toBe(expected);
  });
  it("does not change the existing FX negative-half-away-from-zero rule", () => {
    expect(roundConvertedAmount(-0.005, 1, 1)).toBe(-0.01);
    expect(roundConvertedAmount(43750.09, 1, "17.500001")).toBe(2500);
  });
  it("keeps large invoice totals precise within the currency.js safe-cent range", () => {
    expect(computeTotals([{ description: "Large boundary", quantity: 1, unit_price: 1000000000000.03,
      total: 1000000000000.03 }], 16.5)).toEqual({ subtotal: 1000000000000.03, taxAmount: 165000000000, total: 1165000000000.03 });
  });
  it("retains negative UI amount behavior rather than changing fiscal eligibility", () => {
    expect(computeTotals([{ description: "Legacy signed calculation", quantity: 1, unit_price: -0.03,
      total: -0.03 }], 50)).toEqual({ subtotal: -0.03, taxAmount: -0.01, total: -0.04 });
  });
});
