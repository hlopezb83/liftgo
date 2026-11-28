import { describe, expect, it } from "vitest";
import { sumPaymentsInInvoiceCurrency } from "../paymentCurrency";

describe("invoice payment currency policy", () => {
  it("N7: rounds each MXN payment to invoice cents before summing (synthetic USD 100 / FX 17.5)", () => {
    const result = sumPaymentsInInvoiceCurrency(
      [{ amount: 1, currency: "MXN" }, { amount: 1, currency: "MXN" }],
      "USD",
      17.5,
    );
    // SQL fx_convert_amount: round(1 / 17.5, 2) + round(1 / 17.5, 2).
    expect(result).toEqual({ totalPaid: 0.12, unconvertible: 0 });
    expect(100 - result.totalPaid).toBe(99.88);
  });

  it("rounds a foreign-to-foreign conversion once in the invoice currency", () => {
    expect(sumPaymentsInInvoiceCurrency(
      [{ amount: 1, currency: "EUR", exchange_rate: 19.6 }, { amount: 1, currency: "EUR", exchange_rate: 19.6 }],
      "USD",
      17.5,
    )).toEqual({ totalPaid: 2.24, unconvertible: 0 });
  });

  it("uses invoice currency for legacy payments without a currency, as the balance view does", () => {
    expect(sumPaymentsInInvoiceCurrency([{ amount: 10, currency: null }], "USD", 17.5))
      .toEqual({ totalPaid: 10, unconvertible: 0 });
  });

  it("same-currency payments do not require FX, but cross-currency rates of 1 are missing", () => {
    expect(sumPaymentsInInvoiceCurrency([{ amount: 10, currency: "USD" }], "USD", null))
      .toEqual({ totalPaid: 10, unconvertible: 0 });
    expect(sumPaymentsInInvoiceCurrency([{ amount: 10, currency: "USD", exchange_rate: 1 }], "MXN", null))
      .toEqual({ totalPaid: 0, unconvertible: 1 });
  });

  it("counts missing FX without silently changing the subtotal of convertible payments", () => {
    expect(sumPaymentsInInvoiceCurrency(
      [{ amount: 1, currency: "MXN" }, { amount: 5, currency: "EUR", exchange_rate: null }],
      "USD",
      17.5,
    )).toEqual({ totalPaid: 0.06, unconvertible: 1 });
  });
});
