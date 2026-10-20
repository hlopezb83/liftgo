import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildFromInvoice, type ExistingInvoice } from "../invoiceFormBuilders";
import { useInvoiceFormSubmit } from "../useInvoiceFormSubmit";

vi.mock("@/features/quotes", () => ({
  useUpdateQuote: () => ({ isPending: false }),
}));
vi.mock("../../invoices/useInvoices", () => ({
  useSaveInvoiceWithBookings: () => ({ isPending: false }),
}));

function invoice(taxRate: ExistingInvoice["tax_rate"]): ExistingInvoice {
  return {
    customer_id: null,
    customer_name: "Synthetic draft",
    issued_at: "2026-10-20",
    tax_rate: taxRate,
    line_items: [{
      description: "Synthetic service",
      quantity: 1,
      unit_price: 100,
      total: 100,
      objeto_imp: "02",
    }],
  };
}

describe("invoice editing preserves the missing-vs-zero tax distinction", () => {
  it.each([
    { rate: null, expected: 16 },
    { rate: undefined, expected: 16 },
    { rate: 0, expected: 0 },
    { rate: 16, expected: 16 },
    { rate: "0", expected: 0 },
    { rate: "16", expected: 16 },
  ])("edit and save: $rate becomes $expected", ({ rate, expected }) => {
    const source = invoice(rate);
    const values = buildFromInvoice(source, undefined);
    expect(values.taxRate).toBe(expected);
    const { result } = renderHook(() => useInvoiceFormSubmit());
    const payload = result.current.buildPayload({
      values,
      isEdit: true,
      fromQuoteId: null,
    });
    expect(payload).toMatchObject({
      subtotal: 100,
      tax_rate: expected,
      tax_amount: expected,
      total: 100 + expected,
    });
    // Preparing an edit must not rewrite the loaded document.
    expect(source.tax_rate).toBe(rate);
    expect(buildFromInvoice(payload, undefined).taxRate).toBe(expected);
  });

  it("keeps explicit line-level zero when the header is missing", () => {
    const source = invoice(null);
    source.line_items = [{
      description: "Synthetic zero-rate service",
      quantity: 1,
      unit_price: 100,
      total: 100,
      objeto_imp: "02",
      tax_rate: 0,
    }];
    const values = buildFromInvoice(source, undefined);
    const { result } = renderHook(() => useInvoiceFormSubmit());
    expect(result.current.buildPayload({ values, isEdit: true, fromQuoteId: null }))
      .toMatchObject({ subtotal: 100, tax_rate: 16, tax_amount: 0, total: 100 });
  });
});
