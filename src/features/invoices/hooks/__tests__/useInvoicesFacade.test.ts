import { describe, expect, it } from "vitest";
import * as facade from "../useInvoices";
import * as mutations from "../invoiceMutations";
import * as queries from "../invoiceQueries";

/**
 * Paquete 4 (v8.25.6): la separación consultas/mutaciones no debe cambiar la
 * API pública histórica de `useInvoices.ts` ni la identidad de los símbolos.
 */
const PUBLIC_API = [
  "INVOICE_PAGE_SIZE",
  "fetchInvoicesForExport",
  "invoiceQueries",
  "useInvoices",
  "useInvoice",
  "useInvoicesInfinite",
  "useCreateInvoice",
  "useSaveInvoiceWithBookings",
  "useUpdateInvoice",
  "useDeleteInvoice",
] as const;

describe("fachada useInvoices", () => {
  it("exporta exactamente la API pública previa", () => {
    expect(Object.keys(facade).sort()).toEqual([...PUBLIC_API].sort());
  });

  it("reexporta los mismos símbolos de los módulos internos", () => {
    expect(facade.INVOICE_PAGE_SIZE).toBe(queries.INVOICE_PAGE_SIZE);
    expect(facade.INVOICE_PAGE_SIZE).toBe(100);
    expect(facade.fetchInvoicesForExport).toBe(queries.fetchInvoicesForExport);
    expect(facade.invoiceQueries).toBe(queries.invoiceQueries);
    expect(facade.useInvoices).toBe(queries.useInvoices);
    expect(facade.useInvoice).toBe(queries.useInvoice);
    expect(facade.useInvoicesInfinite).toBe(queries.useInvoicesInfinite);
    expect(facade.useCreateInvoice).toBe(mutations.useCreateInvoice);
    expect(facade.useSaveInvoiceWithBookings).toBe(mutations.useSaveInvoiceWithBookings);
    expect(facade.useUpdateInvoice).toBe(mutations.useUpdateInvoice);
    expect(facade.useDeleteInvoice).toBe(mutations.useDeleteInvoice);
  });

  it("conserva la forma de invoiceQueries (keys/list/detail)", () => {
    expect(typeof facade.invoiceQueries.list).toBe("function");
    expect(typeof facade.invoiceQueries.detail).toBe("function");
    expect(facade.invoiceQueries.keys).toBeDefined();
    expect(facade.invoiceQueries.detail("abc").queryKey).toEqual(
      facade.invoiceQueries.keys.detail("abc"),
    );
  });

  it("separa lecturas de escrituras: ningún módulo mezcla ambos grupos", () => {
    expect(Object.keys(queries)).not.toContain("useCreateInvoice");
    expect(Object.keys(mutations)).not.toContain("useInvoices");
  });
});
