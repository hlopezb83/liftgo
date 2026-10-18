import { describe, expect, it } from "vitest";
import { validateEditPaymentAmount } from "../../components/invoice-detail/validateEditPaymentAmount";
import { convertCurrencyAmount } from "../paymentCurrency";

describe("PostgreSQL numeric rounding parity", () => {
  it("does not pre-round a decimal quotient across the half-cent boundary", () => {
    expect(convertCurrencyAmount(43750.09, "MXN", "USD", 1, "17.500001")).toBe(2500);
    expect(validateEditPaymentAmount(43750.09, 2490, 175, false, {
      invoiceCurrency: "USD", invoiceExchangeRate: "17.500001", paymentCurrency: "MXN", paymentExchangeRate: 1,
    })).toEqual({ ok: true });
  });

  it("rounds exact halves away from zero like PostgreSQL numeric", () => {
    expect(convertCurrencyAmount(-0.005, "MXN", "MXN", 1, 1)).toBe(-0.01);
    expect(convertCurrencyAmount(0.005, "MXN", "MXN", 1, 1)).toBe(0.01);
    expect(convertCurrencyAmount(-0.004, "MXN", "MXN", 1, 1)).toBe(0);
    expect(convertCurrencyAmount(1e21, "MXN", "MXN", 1, 1)).toBe(1e21);
  });

  it("never turns a non-finite edit into a valid zero payment", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(validateEditPaymentAmount(value, 90, 10, false)).toEqual({ ok: false, reason: "missing_exchange_rate" });
    }
  });
});
