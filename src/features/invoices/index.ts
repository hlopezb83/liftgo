/**
 * API pública de la feature `invoices`.
 * Consumir desde otras features mediante `@/features/invoices`.
 * Mantener este barrel pequeño: sólo lo que realmente cruza límites.
 */
export { invoiceKeys, paymentKeys, creditNoteKeys, collectionNoteKeys } from "./lib/queryKeys";
export {
  useInvoices,
  useInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
} from "./hooks/invoices/useInvoices";
export { usePayments, useCreatePayment, useUpdatePayment, type Payment } from "./hooks/usePayments";
export { useInvoicesWithBalance, type InvoiceWithBalance } from "./hooks/invoices/useInvoicesWithBalance";
export { useUpcomingInvoices, type UpcomingInvoice } from "./hooks/invoices/useUpcomingInvoices";
