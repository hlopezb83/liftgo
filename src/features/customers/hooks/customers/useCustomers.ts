/**
 * Fachada de compatibilidad de clientes (Paquete 7).
 *
 * Las lecturas viven en `customerQueries.ts` y las mutaciones en
 * `customerMutations.ts`. Conserva las rutas de importación previas.
 */
export {
  customerQueries,
  useCustomers,
  useCustomer,
  useCustomerPortalAccount,
} from "./customerQueries";
export type {
  Customer,
  CustomerPortalAccountStatus,
  CustomerPortalAccountSummary,
} from "./customerQueries";

export {
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "./customerMutations";
