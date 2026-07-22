import { describe, expect, it } from "vitest";
import {
  createInvoiceListFilters,
  createInvoiceListQueryKey,
  normalizeInvoiceCfdiFilter,
} from "../invoiceListFilters";

describe("normalizeInvoiceCfdiFilter", () => {
  it("acepta valores conocidos", () => {
    expect(normalizeInvoiceCfdiFilter("pending")).toBe("pending");
    expect(normalizeInvoiceCfdiFilter("stamped")).toBe("stamped");
    expect(normalizeInvoiceCfdiFilter("error")).toBe("error");
    expect(normalizeInvoiceCfdiFilter("cancelled")).toBe("cancelled");
  });

  it("regresa 'all' para valores inválidos o nulos", () => {
    expect(normalizeInvoiceCfdiFilter(null)).toBe("all");
    expect(normalizeInvoiceCfdiFilter(undefined)).toBe("all");
    expect(normalizeInvoiceCfdiFilter("bogus")).toBe("all");
  });
});

describe("createInvoiceListFilters", () => {
  it("incluye cfdi por default en 'all'", () => {
    const f = createInvoiceListFilters();
    expect(f.cfdi).toBe("all");
  });

  it("respeta el filtro cfdi", () => {
    const f = createInvoiceListFilters({ cfdi: "stamped" });
    expect(f.cfdi).toBe("stamped");
  });
});

describe("createInvoiceListQueryKey", () => {
  it("segrega la cache por cfdi_status", () => {
    const a = createInvoiceListQueryKey({ cfdi: "stamped" });
    const b = createInvoiceListQueryKey({ cfdi: "pending" });
    expect(a).not.toEqual(b);
  });
});
