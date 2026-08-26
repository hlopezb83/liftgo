import { describe, it, expect } from "vitest";
import {
  invoiceKeys,
  paymentKeys,
  creditNoteKeys,
  collectionNoteKeys,
  invoiceBookingKeys,
} from "../queryKeys";

describe("invoiceKeys", () => {
  it("deriva las keys de lista y detalle del namespace base", () => {
    expect(invoiceKeys.all[0]).toBe("invoices");
    expect(invoiceKeys.list({ status: "sent" })).toEqual(
      invoiceKeys.byFilter({ status: "sent" }),
    );
    expect(invoiceKeys.detail("i1")).toContain("i1");
  });

  it("withBalance normaliza parámetros ausentes a null", () => {
    expect(invoiceKeys.withBalance({})).toEqual([
      ...invoiceKeys.all,
      "with-balance",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(invoiceKeys.withBalance({ statuses: ["sent"], limit: 10 })).toContain(10);
  });

  it("expone keys especializadas estables", () => {
    expect(invoiceKeys.upcoming()).toEqual([...invoiceKeys.all, "upcoming"]);
    expect(invoiceKeys.nextNumber()).toEqual([...invoiceKeys.all, "next-number"]);
    expect(invoiceKeys.byQuote("q1")).toEqual([...invoiceKeys.all, "quote", "q1"]);
    const filters = { from: "2026-01-01", to: "2026-01-31", fiscalState: "all", env: "test" };
    expect(invoiceKeys.reconciliation(filters)).toEqual([
      ...invoiceKeys.all,
      "reconciliation",
      filters,
    ]);
  });
});

describe("keys por factura", () => {
  it("cada namespace scopea por invoiceId", () => {
    expect(paymentKeys.byInvoice("i1")).toEqual([...paymentKeys.all, "i1"]);
    expect(creditNoteKeys.byInvoice("i1")).toEqual([...creditNoteKeys.all, "invoice", "i1"]);
    expect(collectionNoteKeys.byInvoice("i1")).toEqual([...collectionNoteKeys.all, "i1"]);
    expect(invoiceBookingKeys.byInvoice("i1")).toEqual([...invoiceBookingKeys.all, "i1"]);
  });
});
