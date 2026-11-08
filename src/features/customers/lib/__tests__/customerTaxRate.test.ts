import { describe, expect, it } from "vitest";
import { customerTaxRate } from "../customerTaxRate";

describe("customerTaxRate preserves the invoice prefill policy", () => {
  it.each([0, 8, 16, 11, 100, 101])( "preserves a finite nonnegative rate %s", (rate) => {
    expect(customerTaxRate(rate)).toBe(rate);
    expect(customerTaxRate(String(rate))).toBe(rate);
  });
  it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, "invalid"])("leaves the caller's fallback untouched for %s", (rate) => {
    expect(customerTaxRate(rate)).toBeUndefined();
  });
  it.each(["", " "])("keeps existing Number coercion for an empty string %j", (rate) => {
    expect(customerTaxRate(rate)).toBe(0);
  });
});
