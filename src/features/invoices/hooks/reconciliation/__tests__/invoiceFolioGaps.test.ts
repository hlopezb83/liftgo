import { describe, expect, it } from "vitest";
import { findInvoiceFolioGaps } from "../invoiceFolioGaps";

describe("findInvoiceFolioGaps", () => {
  it("ignores drafts and identifiers outside the internal FAC numeric series", () => {
    const result = findInvoiceFolioGaps([
      { invoice_number: "FAC-0001", status: "sent" },
      { invoice_number: "BORRADOR-0002", status: "draft" },
      { invoice_number: "FAC-0003", status: "draft" },
      { invoice_number: "FAC-AUTO-0004", status: "sent" },
      { invoice_number: "OTHER-0005", status: "sent" },
    ]);

    expect(result).toEqual({ count: 0, preview: [] });
  });

  it("counts only missing folios between issued invoices, including canceled ones", () => {
    const result = findInvoiceFolioGaps([
      { invoice_number: "FAC-0001", status: "sent" },
      { invoice_number: "FAC-0002", status: "cancelled" },
      { invoice_number: "FAC-0003", status: "sent" },
      { invoice_number: "FAC-0004", status: "paid" },
      { invoice_number: "FAC-0006", status: "sent" },
    ]);

    expect(result).toEqual({ count: 1, preview: ["0005"] });
  });

  it("keeps a compact preview while counting every gap", () => {
    const result = findInvoiceFolioGaps([
      { invoice_number: "FAC-0001", status: "sent" },
      { invoice_number: "FAC-0200", status: "sent" },
    ]);

    expect(result.count).toBe(198);
    expect(result.preview).toHaveLength(100);
    expect(result.preview[0]).toBe("0002");
    expect(result.preview[result.preview.length - 1]).toBe("0101");
  });

  it("does not report a gap when fewer than two real folios exist", () => {
    expect(
      findInvoiceFolioGaps([{ invoice_number: "FAC-0001", status: "sent" }]),
    ).toEqual({ count: 0, preview: [] });
  });
});
