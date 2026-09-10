import { describe, expect, it } from "vitest";
import { isIssuedInvoiceStatus } from "../invoiceStatus";

describe("Bloque 3C · estados de factura emitida", () => {
  it("cuenta sent/partial/overdue/paid como emitidas", () => {
    for (const s of ["sent", "partial", "overdue", "paid"]) {
      expect(isIssuedInvoiceStatus(s)).toBe(true);
    }
  });

  it("no cuenta draft, void, cancelled ni vacíos", () => {
    for (const s of ["draft", "void", "cancelled", "", null, undefined]) {
      expect(isIssuedInvoiceStatus(s as string | null | undefined)).toBe(false);
    }
  });
});
