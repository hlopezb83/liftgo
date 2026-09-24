/**
 * Fachada de compatibilidad de clientes (Paquete 7).
 *
 * Las lecturas viven en `customerQueries.ts` y las mutaciones en
 * `customerMutations.ts`. Este archivo conserva exactamente la API y las rutas
 * de importación previas; no agrega comportamiento.
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
