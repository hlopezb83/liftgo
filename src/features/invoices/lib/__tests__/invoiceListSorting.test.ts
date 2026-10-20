import { describe, expect, it } from "vitest";
import { normalizeInvoiceListSorting } from "../invoiceListSorting";

describe("invoice list sorting", () => {
  it("keeps only sortable server columns and drops duplicate keys", () => {
    expect(normalizeInvoiceListSorting([
      { id: "total", desc: true }, { id: "view", desc: false },
      { id: "total", desc: false }, { id: "customer_name", desc: false },
    ])).toEqual([{ id: "total", desc: true }, { id: "customer_name", desc: false }]);
  });
  it("supports each invoice header without changing sort priority", () => {
    const sorting = ["invoice_number", "customer_name", "total", "status", "issued_at", "due_date"].map(id => ({ id, desc: true }));
    expect(normalizeInvoiceListSorting(sorting)).toEqual(sorting);
  });
  it("does not mutate the controlled state and allows clearing sorting", () => {
    const sorting = Object.freeze([Object.freeze({ id: "total", desc: false })]);
    expect(normalizeInvoiceListSorting(sorting)).toEqual(sorting);
    expect(normalizeInvoiceListSorting([])).toEqual([]);
  });
});
