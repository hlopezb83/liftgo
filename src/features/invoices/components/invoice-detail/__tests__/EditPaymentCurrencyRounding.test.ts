import { describe, expect, it } from "vitest";
import { validateEditPaymentAmount } from "../validateEditPaymentAmount";

describe("edit payment cents are validated in invoice currency", () => {
  it("does not treat one USD cent as one MXN cent of tolerance", () => {
    const fx = { invoiceCurrency: "MXN", paymentCurrency: "USD", paymentExchangeRate: 17.5 };
    // Synthetic MXN 17.50 invoice: original USD 1 paid MXN 17.50 in full.
    // USD 1.01 converts to MXN 17.68, beyond the MXN 0.01 tolerance.
    expect(validateEditPaymentAmount(1.01, 0, 1, false, fx))
      .toEqual({ ok: false, maxAllowed: 1 });
  });

  it("compares MXN cent edits after rounding each payment to USD invoice cents", () => {
    const fx = { invoiceCurrency: "USD", invoiceExchangeRate: 17.5, paymentCurrency: "MXN" };
    // Synthetic USD 100 invoice: both amounts round to the same USD 100 payment.
    expect(validateEditPaymentAmount(1750.02, 0, 1750, false, fx)).toEqual({ ok: true });
  });

  it("applies the existing one-cent tolerance in invoice currency in either direction", () => {
    const usdInvoice = { invoiceCurrency: "USD", invoiceExchangeRate: 17.5, paymentCurrency: "MXN" };
    expect(validateEditPaymentAmount(1750.26, 0, 1750, false, usdInvoice)).toEqual({ ok: true });
    expect(validateEditPaymentAmount(1750.27, 0, 1750, false, usdInvoice))
      .toEqual({ ok: false, maxAllowed: 1750 });

    const mxnInvoice = { invoiceCurrency: "MXN", paymentCurrency: "USD", paymentExchangeRate: 17.5 };
    expect(validateEditPaymentAmount(1, 0.01, 1, false, mxnInvoice)).toEqual({ ok: true });
    expect(validateEditPaymentAmount(1.01, 0.01, 1, false, mxnInvoice))
      .toEqual({ ok: false, maxAllowed: 1 });
  });
});
