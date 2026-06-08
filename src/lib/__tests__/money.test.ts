import { describe, it, expect } from "vitest";
import { roundMoney, sumMoney } from "@/lib/money";

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
