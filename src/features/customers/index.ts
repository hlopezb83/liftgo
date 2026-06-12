/**
 * API pública de la feature `customers`.
 */
export { customerKeys } from "./lib/queryKeys";
export {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  type Customer,
} from "./hooks/customers/useCustomers";
export { useInviteCustomer } from "./hooks/customers/useInviteCustomer";
