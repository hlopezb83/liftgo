import { describe, expect, it } from "vitest";
import { validateEditPaymentAmount } from "../validateEditPaymentAmount";

describe("canonical strict invoice-currency maximum", () => {
  const mxnOnUsd = { invoiceCurrency: "USD", invoiceExchangeRate: 17.5, paymentCurrency: "MXN", paymentExchangeRate: 18 };

  it("rejects a whole extra invoice cent while retaining cents that round to the same value", () => {
    expect(validateEditPaymentAmount(1750.08, 90, 175, false, mxnOnUsd)).toEqual({ ok: true });
    for (const amount of [1750.09, 1750.26, 1800]) {
      expect(validateEditPaymentAmount(amount, 90, 175, false, mxnOnUsd)).toEqual({ ok: false, maxAllowed: 1750 });
    }
    expect(validateEditPaymentAmount(100.01, 90, 10, false)).toEqual({ ok: false, maxAllowed: 100 });
  });

  it("validates the rounded source amount that the form and server persist", () => {
    const usdOnMxn = { invoiceCurrency: "MXN", paymentCurrency: "USD", paymentExchangeRate: 17.5 };
    expect(validateEditPaymentAmount(0.015, 0.3, 0, false, usdOnMxn)).toEqual({ ok: false, maxAllowed: 0.02 });
    expect(validateEditPaymentAmount(0.015, 0.35, 0, false, usdOnMxn)).toEqual({ ok: true });
  });

  it("keeps stamped REP validation bypass; fiscal protection remains server-side", () => {
    expect(validateEditPaymentAmount(999999, 0, 0, true, { ...mxnOnUsd, invoiceExchangeRate: null })).toEqual({ ok: true });
  });
});
