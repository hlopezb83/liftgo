// Barrel público de la feature "maintenance".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { maintenanceLogQueries, useMaintenanceLogs } from "./hooks/useMaintenanceLogs";
export {
  type MaintenancePolicy,
  useCreateMaintenancePolicy,
  useDeleteMaintenancePolicy,
  useMaintenancePolicies,
  useUpdateMaintenancePolicy,
} from "./hooks/useMaintenancePolicies";
export {
  type Mechanic,
  useCreateMechanic,
  useDeleteMechanic,
  useMechanics,
  useUpdateMechanic,
} from "./hooks/useMechanics";
// v7.306.1 · ARQ2-A5: exponer queryKeys al público para consumo cross-feature.
export { useMaintenancePolicyOptions } from "./hooks/useMaintenancePolicyOptions";
