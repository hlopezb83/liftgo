/**
 * Fachada de compatibilidad del módulo de facturas (v8.25.6).
 * La implementación vive en `invoiceQueries.ts` (lecturas) e
 * `invoiceMutations.ts` (escrituras). Este archivo conserva la API pública
 * previa para no romper imports profundos existentes.
 */
export {
  fetchInvoicesForExport,
  INVOICE_PAGE_SIZE,
  invoiceQueries,
  useInvoice,
  useInvoices,
  useInvoicesInfinite,
} from "./invoiceQueries";

export {
  useCreateInvoice,
  useDeleteInvoice,
  useSaveInvoiceWithBookings,
  useUpdateInvoice,
} from "./invoiceMutations";

export type { SaveInvoiceWithBookingsArgs } from "./invoiceMutations";
