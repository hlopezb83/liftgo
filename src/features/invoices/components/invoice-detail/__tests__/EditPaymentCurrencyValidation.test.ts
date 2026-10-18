import { describe, expect, it } from "vitest";
import { validateEditPaymentAmount } from "../validateEditPaymentAmount";

const mxnPaymentOnUsdInvoice = {
  invoiceCurrency: "USD",
  invoiceExchangeRate: 17.5,
  paymentCurrency: "MXN",
  paymentExchangeRate: null,
};

describe("edit payment currency validation", () => {
  it("N8: permits MXN 350 with USD 90 remaining and original MXN 175 (synthetic USD 100 / FX 17.5)", () => {
    expect(validateEditPaymentAmount(350, 90, 175, false, mxnPaymentOnUsdInvoice)).toEqual({ ok: true });
    expect(validateEditPaymentAmount(1750, 90, 175, false, mxnPaymentOnUsdInvoice)).toEqual({ ok: true });
  });

  it("N8: reports the maximum in the payment currency, MXN 1750", () => {
    expect(validateEditPaymentAmount(1751, 90, 175, false, mxnPaymentOnUsdInvoice))
      .toEqual({ ok: false, maxAllowed: 1750 });
  });

  it("converts the original payment at invoice precision before computing the maximum", () => {
    // The original MXN 1 contributed USD 0.06, leaving USD 99.94.
    expect(validateEditPaymentAmount(1750, 99.94, 1, false, mxnPaymentOnUsdInvoice)).toEqual({ ok: true });
    expect(validateEditPaymentAmount(1751, 99.94, 1, false, mxnPaymentOnUsdInvoice))
      .toEqual({ ok: false, maxAllowed: 1750 });
  });

  it("also validates a USD payment on an MXN invoice", () => {
    const fx = { invoiceCurrency: "MXN", paymentCurrency: "USD", paymentExchangeRate: 17.5 };
    expect(validateEditPaymentAmount(100, 1575, 10, false, fx)).toEqual({ ok: true });
    expect(validateEditPaymentAmount(101, 1575, 10, false, fx)).toEqual({ ok: false, maxAllowed: 100 });
  });

  it("blocks validation if a cross-currency rate is missing", () => {
    expect(validateEditPaymentAmount(350, 90, 175, false, { ...mxnPaymentOnUsdInvoice, invoiceExchangeRate: null }))
      .toEqual({ ok: false, reason: "missing_exchange_rate" });
  });

  it("preserves REP stamped bypass even when conversion is unavailable", () => {
    expect(validateEditPaymentAmount(999999, 90, 175, true, { ...mxnPaymentOnUsdInvoice, invoiceExchangeRate: null }))
      .toEqual({ ok: true });
  });
});
