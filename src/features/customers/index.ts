// Barrel público de la feature "customers".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export * from "./components/customers/CustomerSelector";
export * from "./hooks/customers/useCustomerPortal";
export * from "./hooks/customers/useCustomerSummary";
export * from "./hooks/customers/useCustomers";
// Compatibility export; the shared fiscal capability is not owned by customers.
export { useParseCsf, type ParsedCsfData } from "@/lib/fiscal/useParseCsf";
