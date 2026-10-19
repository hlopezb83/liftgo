import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertCurrencyAmount, sumPaymentsInInvoiceCurrency } from "@/features/invoices/lib/paymentCurrency";
import { validateEditPaymentAmount } from "@/features/invoices/components/invoice-detail/validateEditPaymentAmount";

type FxVector = {
  id: string;
  amount: string;
  from_currency: string;
  to_currency: string;
  from_rate: string | null;
  to_rate: string | null;
  canonical: number | null;
};
const dataset = JSON.parse(readFileSync(new URL("./fx-vectors-results.json", import.meta.url), "utf8")) as { count: number; vectors: FxVector[] };

describe("direct client conversion equals independently executed PostgreSQL numeric", () => {
  it.each(dataset.vectors)("$id", (vector) => {
    expect(convertCurrencyAmount(Number(vector.amount), vector.from_currency, vector.to_currency, vector.from_rate, vector.to_rate))
      .toBe(vector.canonical);
  });
});

describe("standalone policy boundaries", () => {
  it("exports exactly the 48 intended vectors", () => {
    expect(dataset.count).toBe(48);
    expect(dataset.vectors).toHaveLength(48);
  });
  it("keeps N7 per-payment cents", () => {
    expect(sumPaymentsInInvoiceCurrency([{ amount: 1, currency: "MXN", exchange_rate: 1 }, { amount: 1, currency: "MXN", exchange_rate: 1 }], "USD", 17.5))
      .toEqual({ totalPaid: 0.12, unconvertible: 0 });
  });
  it("accepts the six-decimal SQL guard boundary", () => {
    expect(validateEditPaymentAmount(43750.09, 2490, 175, false, { invoiceCurrency: "USD", invoiceExchangeRate: "17.500001", paymentCurrency: "MXN", paymentExchangeRate: 1 }))
      .toEqual({ ok: true });
  });
  it("rejects one canonical cent above the maximum", () => {
    expect(validateEditPaymentAmount(1750.09, 90, 175, false, { invoiceCurrency: "USD", invoiceExchangeRate: 17.5, paymentCurrency: "MXN", paymentExchangeRate: 18 }).ok)
      .toBe(false);
  });
  it("normalizes source cents before validating USD0.015 against MXN0.30", () => {
    expect(validateEditPaymentAmount(0.015, 0.30, 0, false, { invoiceCurrency: "MXN", invoiceExchangeRate: 1, paymentCurrency: "USD", paymentExchangeRate: 17.5 }).ok)
      .toBe(false);
  });
});
