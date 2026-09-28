import { describe, expect, it } from "vitest";
import {
  mergeLiveInvoiceHistory,
  type HistoricalInvoice,
} from "../../../../../supabase/functions/generate-recurring-invoices/invoiceHistory";

function invoice(id: string, overrides: Partial<HistoricalInvoice> = {}): HistoricalInvoice {
  return {
    id,
    invoice_number: `FAC-${id}`,
    billing_period_start: "2026-09-01",
    billing_period_end: "2026-09-30",
    status: "draft",
    cfdi_status: null,
    line_items: [],
    ...overrides,
  };
}

describe("recurring invoice history", () => {
  it("keeps active drafts with null CFDI status and invoices without a pivot", () => {
    const pivoted = invoice("pivoted");
    const direct = invoice("legacy");
    expect(mergeLiveInvoiceHistory([{ invoices: pivoted }], [pivoted, direct]))
      .toEqual([pivoted, direct]);
  });

  it("does not treat cancelled invoices as billed periods or charged extras", () => {
    const cancelled = invoice("cancelled", {
      status: "cancelled",
      line_items: [{ description: "Logística", total: 100 }],
    });
    const cancelledCfdi = invoice("cancelled-cfdi", { cfdi_status: "cancelled" });
    expect(mergeLiveInvoiceHistory(
      [{ invoices: cancelled }, { invoices: cancelledCfdi }],
      [cancelled, cancelledCfdi],
    )).toEqual([]);
  });
});
