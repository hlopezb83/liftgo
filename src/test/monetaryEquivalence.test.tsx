import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTotals, lineItemTotal } from "@/lib/domain/invoiceTotals";
import { convertCurrencyAmount, sumPaymentsInInvoiceCurrency } from "@/features/invoices/lib/paymentCurrency";
import { validateEditPaymentAmount } from "@/features/invoices/components/invoice-detail/validateEditPaymentAmount";
import { customerFormSchema } from "@/features/customers/lib/customerFormSchema";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { Tables } from "@/integrations/supabase/types";
import { recurringChargeAmounts, type RecurringQuoteCharge } from "../../supabase/functions/generate-recurring-invoices/quoteCharges";
import { validateCreditNoteSourceLines } from "../../supabase/functions/_shared/creditNoteSourceValidation";
import { documentCases, creditCases, conversionCases, missingRateCases, mixedPayments, fractionalTaxDiscrepancy } from "../../tests/fixtures/monetaryEquivalence";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/features/invoices/hooks/creditNotes/useCreditNotes", () => ({
  useCreateCreditNote: () => ({ mutate, isPending: false }),
}));
import { CreateCreditNoteDialog } from "@/features/invoices/components/invoice-detail/CreateCreditNoteDialog";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MEJ-005 shared monetary cases at actual UI/Edge boundaries", () => {
  it.each(documentCases)("$id: UI invoice totals equal Edge charge totals to the cent", (c) => {
    const lines = c.lines.map((line) => ({ ...line, total: lineItemTotal(line.quantity, line.unit_price) }));
    const ui = computeTotals(lines, c.taxRate);
    const edge = lines.map((line) => recurringChargeAmounts(line as RecurringQuoteCharge, c.taxRate));
    expect(ui).toEqual(c.expected);
    expect({ subtotal: edge.reduce((s, l) => s + l.netCents, 0) / 100,
      taxAmount: edge.reduce((s, l) => s + l.taxCents, 0) / 100,
      total: edge.reduce((s, l) => s + l.netCents + l.taxCents, 0) / 100 }).toEqual(c.expected);
  });

  it.each(creditCases)("$id: rendered partial NC and submitted draft match Edge validation", (c) => {
    const source = { ...c.source, total: lineItemTotal(c.source.quantity, c.source.unit_price) };
    const sourceTotals = computeTotals([source], c.taxRate);
    const invoice = { id: "11111111-1111-4111-8111-111111111111", customer_id: "synthetic", invoice_number: c.id,
      moneda: c.currency, tax_rate: c.taxRate, line_items: [source], total: sourceTotals.total } as unknown as Tables<"invoices">;
    render(<CreateCreditNoteDialog open onOpenChange={vi.fn()} invoice={invoice} maxCreditable={sourceTotals.total} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: `Cantidad a acreditar de ${source.description}` }), { target: { value: String(c.selectedQuantity) } });
    for (const amount of Object.values(c.expected)) {
      expect(screen.getByRole("dialog")).toHaveTextContent(formatCurrencyWithCode(amount, c.currency).replace(/\s/g, " "));
    }
    fireEvent.change(screen.getByPlaceholderText("Ej: Devolución equipo X el 15-mar"), { target: { value: "Local parity fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const draft = mutate.mock.calls[0][0];
    expect(draft).toMatchObject({ subtotal: c.expected.subtotal, tax_amount: c.expected.taxAmount,
      total: c.expected.total, currency: c.currency, stamp: false });
    expect(draft.line_items[0]).toMatchObject({ discount: c.allocatedDiscount, total: c.expected.subtotal, source_line_index: 0 });
    const edge = validateCreditNoteSourceLines(draft, invoice as unknown as Record<string, unknown>);
    expect(edge).toMatchObject({ ok: true, ...c.expected });
    // One cent is a failure, not a tolerated fuzzy comparison at this boundary.
    expect(validateCreditNoteSourceLines({ ...draft, total: c.expected.total + 0.01 }, invoice as unknown as Record<string, unknown>))
      .toMatchObject({ ok: false, code: "CREDIT_NOTE_TOTALS_MISMATCH" });
  });

  it.each(conversionCases)("$id: UI currency conversion matches the shared decimal expectation", (c) => {
    expect(convertCurrencyAmount(c.amount, c.from, c.to, c.fromRate, c.toRate)).toBe(c.expected);
  });
  it("sums mixed currency payments only after rounding each conversion", () => {
    expect(sumPaymentsInInvoiceCurrency(mixedPayments.payments, mixedPayments.currency, mixedPayments.rate))
      .toEqual({ totalPaid: mixedPayments.expected, unconvertible: 0 });
  });
  it.each(missingRateCases)("missing USD rate %s is an explicit validation error, never 1:1", (rate) => {
    expect(convertCurrencyAmount(10, "USD", "MXN", rate, 1)).toBeNull();
    expect(sumPaymentsInInvoiceCurrency([{ amount: 10, currency: "USD", exchange_rate: rate }], "MXN", 1))
      .toEqual({ totalPaid: 0, unconvertible: 1 });
    expect(validateEditPaymentAmount(10, 100, 0, false, {
      invoiceCurrency: "MXN", paymentCurrency: "USD", paymentExchangeRate: rate,
    })).toEqual({ ok: false, reason: "missing_exchange_rate" });
  });
  it.each([0, 8, 16])("standard rate %s retains per-line parity at monetary boundaries", (rate) => {
    for (const amount of [0.01, 0.03, 0.06, 0.25, 0.99, 1.005, 100.01, 1000.99]) {
      const line = { description: "Standard rate", quantity: 1, unit_price: amount, total: lineItemTotal(1, amount) };
      const edge = recurringChargeAmounts(line as RecurringQuoteCharge, rate);
      expect(computeTotals([line], rate)).toEqual({ subtotal: edge.netCents / 100,
        taxAmount: edge.taxCents / 100, total: (edge.netCents + edge.taxCents) / 100 });
    }
  });
  it("D1 is reachable through the existing customer tax field/schema, not a new rule", () => {
    expect(customerFormSchema.shape.tax_rate.parse("16.5")).toBe("16.5");
  });
  it("negative NC quantity remains rejected, not normalized into a credit", () => {
    expect(validateCreditNoteSourceLines({ subtotal: 1, tax_amount: 0, total: 1,
      line_items: [{ quantity: -1, unit_price: 1, source_line_index: 0 }],
    }, { tax_rate: 16, line_items: [{ quantity: 1, unit_price: 1 }] }))
      .toMatchObject({ ok: false, code: "INVALID_CREDIT_NOTE_LINE" });
  });
  it("MEJ005-D1 acceptance: fractional-tax UI/Edge must agree to the cent (OPEN product bug)", () => {
    const c = fractionalTaxDiscrepancy;
    const line = { ...c.line, total: lineItemTotal(c.line.quantity, c.line.unit_price) };
    const ui = computeTotals([line], c.taxRate);
    expect(recurringChargeAmounts(line as RecurringQuoteCharge, c.taxRate)).toEqual({ netCents: 3, taxCents: 0 });
    // Deliberately red, neither skipped nor expected-failure: do not call MEJ-005
    // complete or turn this into a characterization of the divergent result.
    expect(ui).toEqual(c.expected);
  });
});
