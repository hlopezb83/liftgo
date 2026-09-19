/**
 * Fachada de compatibilidad del portal de clientes (v8.25.7).
 * Las consultas viven en `customerPortalQueries.ts` y los tipos en
 * `customerPortal.types.ts`. Este archivo conserva la API y las rutas de
 * importación previas para no romper consumidores existentes.
 */
export {
  usePortalBookings,
  usePortalBookingsPage,
  usePortalContracts,
  usePortalContractsPage,
  usePortalCustomer,
  usePortalInvoice,
  usePortalInvoicePayments,
  usePortalInvoices,
  usePortalInvoicesPage,
  usePortalPayments,
} from "./customerPortalQueries";

export type {
  PortalBookingRow,
  PortalContractRow,
  PortalCustomerRow,
  PortalInvoiceRow,
  PortalPage,
  PortalPaymentRow,
} from "./customerPortal.types";
