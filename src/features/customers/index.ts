// Barrel público de la feature "customers".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { type CustomerListQuery, CustomerSelector } from "./components/CustomerSelector";
export { useCustomerSummary } from "./hooks/useCustomerSummary";
export {
  type Customer,
  customerQueries,
  useCustomer,
  useCustomers,
} from "./hooks/useCustomers";
export { customerTaxRate } from "./lib/customerTaxRate";
