import { describe, expect, it } from "vitest";
import { invoiceCreditBalanceCases } from "../../../../../tests/fixtures/invoiceCreditBalance";
import { computeInvoiceCreditBalance } from "../invoiceCreditBalance";

const invoice = { id: "invoice-a", organization_id: "company-a", customer_id: "customer-a",
  invoice_number: "FAC-001", total: 100, moneda: "MXN", tipo_cambio: 1, status: "paid" };
const payment = { id: "pay-a", invoice_id: invoice.id, amount: 100, currency: "MXN", exchange_rate: 1,
  payment_date: "2026-10-20", reference_number: "REF-001", rep_cfdi_uuid: null };
const credit = { id: "credit-a", invoice_id: invoice.id, customer_id: invoice.customer_id,
  credit_note_number: "NC-001", total: 30, currency: "MXN", cfdi_status: "stamped", status: "issued", cancellation_status: "none" };

describe("read-only invoice credit balance evidence", () => {
  it("does not manufacture credit from a note without a cash overpayment", () => {
    expect(computeInvoiceCreditBalance(invoice, [], [credit]).excess).toBe(0);
    expect(computeInvoiceCreditBalance(invoice, [{ ...payment, amount: 70 }], [credit]).excess).toBe(0);
    expect(computeInvoiceCreditBalance(invoice, [], [{ ...credit, total: 100 }]).excess).toBe(0);
  });
  it("subtracts NC once and preserves original payment, customer, company and invoice identities", () => {
    const result = computeInvoiceCreditBalance(invoice, [payment], [credit]);
    expect(result).toMatchObject({ invoiceId: invoice.id, customerId: "customer-a", organizationId: "company-a",
      invoiceTotal: 100, paid: 100, credited: 30, netInvoiced: 70, excess: 30, issue: null });
    expect(result.payments[0]).toMatchObject({ id: "pay-a", reference: "REF-001", amount: 100, converted: 100 });
    expect(result.credits).toEqual([{ id: "credit-a", number: "NC-001", amount: 30, currency: "MXN" }]);
    expect(payment.amount).toBe(100);
    expect(credit.total).toBe(30);
  });
  it("retains a cash-only legacy overpayment without making a synthetic note", () => {
    const result = computeInvoiceCreditBalance(invoice, [{ ...payment, amount: 110 }], []);
    expect(result.excess).toBe(10);
    expect(result.credits).toEqual([]);
  });
  it.each([
    { cfdi_status: "pending", status: "draft", cancellation_status: null },
    { cfdi_status: "stamped", status: "cancelled", cancellation_status: null },
    { cfdi_status: "stamped", status: "issued", cancellation_status: "accepted" },
  ])("excludes an inactive credit ($cfdi_status / $status / $cancellation_status)", (state) => {
    const result = computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, ...state }]);
    expect(result.excess).toBe(0);
    expect(result.credits).toEqual([]);
  });
  it("keeps a pending fiscal cancellation active until accepted", () => {
    expect(computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, cancellation_status: "pending" }]).excess).toBe(30);
  });
  it("converts each payment to invoice cents before summing and preserves both captured rates", () => {
    const result = computeInvoiceCreditBalance({ ...invoice, total: 0.11, moneda: "USD", tipo_cambio: 17.5 },
      [{ ...payment, amount: 1 }, { ...payment, id: "pay-b", amount: 1 }], []);
    expect(result).toMatchObject({ currency: "USD", exchangeRate: 17.5, paid: 0.12, excess: 0.01 });
    expect(result.payments.map((row) => row.converted)).toEqual([0.06, 0.06]);
    expect(result.payments[0]).toMatchObject({ currency: "MXN", exchangeRate: 1, amount: 1 });
  });
  it("keeps an all-USD excess in USD when MXN conversion is unavailable", () => {
    const result = computeInvoiceCreditBalance({ ...invoice, moneda: "USD", tipo_cambio: null },
      [{ ...payment, currency: "USD", exchange_rate: null }], [{ ...credit, currency: "USD" }]);
    expect(result).toMatchObject({ currency: "USD", exchangeRate: null, excess: 30, issue: null });
  });
  it.each([null, 0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not claim an excess with missing cross-currency FX %s", (rate) => {
    const result = computeInvoiceCreditBalance(invoice,
      [payment, { ...payment, id: "pay-b", currency: "USD", exchange_rate: rate }], [credit]);
    expect(result).toMatchObject({ excess: null, issue: "missing_fx" });
    expect(result.payments[1].converted).toBeNull();
  });
  it.each(["draft", "cancelled"])("does not call an inactive %s invoice balance available", (status) => {
    expect(computeInvoiceCreditBalance({ ...invoice, status }, [payment], [credit]))
      .toMatchObject({ excess: null, issue: "inactive_invoice" });
  });
  it("also blocks an accepted invoice cancellation with a stale status", () => {
    expect(computeInvoiceCreditBalance({ ...invoice, cancellation_status: "accepted" }, [payment], [credit]))
      .toMatchObject({ excess: null, issue: "inactive_invoice" });
  });
  it("fails closed on foreign invoice/customer evidence and duplicate source rows", () => {
    const cases = [
      computeInvoiceCreditBalance(invoice, [{ ...payment, invoice_id: "invoice-b" }], [credit]),
      computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, invoice_id: "invoice-b" }]),
      computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, customer_id: "customer-b" }]),
      computeInvoiceCreditBalance(invoice, [payment, payment], [credit]),
      computeInvoiceCreditBalance(invoice, [payment], [credit, credit]),
      computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, currency: "USD" }]),
    ];
    for (const result of cases) expect(result).toMatchObject({ excess: null, issue: "invalid_source" });
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER])("does not silently turn invalid money %s into credit", (amount) => {
    expect(computeInvoiceCreditBalance({ ...invoice, total: amount }, [payment], [credit]).excess).toBeNull();
    expect(computeInvoiceCreditBalance(invoice, [{ ...payment, amount }], [credit]).excess).toBeNull();
    expect(computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, total: amount }]).excess).toBeNull();
  });
  it("rejects credits above the invoice total rather than manufacturing cash", () => {
    expect(computeInvoiceCreditBalance(invoice, [], [{ ...credit, total: 150 }]))
      .toMatchObject({ excess: null, issue: "invalid_source" });
  });
  it("recomputes evidence after source correction/cancellation without persistent operations", () => {
    expect(computeInvoiceCreditBalance(invoice, [payment], [credit]).excess).toBe(30);
    expect(computeInvoiceCreditBalance(invoice, [], [credit]).excess).toBe(0);
    expect(computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, cancellation_status: "accepted" }]).excess).toBe(0);
    expect(computeInvoiceCreditBalance(invoice, [payment], [credit]).excess).toBe(30);
  });
});

describe("shared PostgreSQL decimal controls", () => {
  it.each(invoiceCreditBalanceCases)("$id", (control) => {
    const result = computeInvoiceCreditBalance({ ...invoice, total: control.total, moneda: control.currency, tipo_cambio: control.rate },
      control.payments.map((p, index) => ({ ...payment, id: `p${index}`, amount: p.amount, currency: p.currency, exchange_rate: p.rate })),
      control.credit ? [{ ...credit, total: control.credit, currency: control.currency }] : []);
    expect(result.excess).toBe(control.expected);
  });
});


it("uses the same active-NULL criterion as the invoice detail and current status synchronizer", () => {
  expect(computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, cancellation_status: null }]))
    .toMatchObject({ excess: 30, issue: null });
  // A note without cash still cannot manufacture excess.
  expect(computeInvoiceCreditBalance(invoice, [], [{ ...credit, cancellation_status: null }]).excess).toBe(0);
});


it("omits out-of-scope source documents from the visible trace instead of leaking them in an error", () => {
  const result = computeInvoiceCreditBalance(invoice, [{ ...payment, invoice_id: "invoice-b" }], [{ ...credit, customer_id: "customer-b" }]);
  expect(result).toMatchObject({ excess: null, issue: "invalid_source", payments: [], credits: [] });
});

it("preserves the original currency in a mismatched note trace instead of relabeling it", () => {
  const result = computeInvoiceCreditBalance(invoice, [payment], [{ ...credit, currency: "USD" }]);
  expect(result.excess).toBeNull();
  expect(result.credits[0].currency).toBe("USD");
});
