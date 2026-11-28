// Barrel público de la feature "fleet".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { ForkliftSelector } from "./components/ForkliftSelector";
export { ForkliftAvailabilityHelp } from "./components/ForkliftAvailabilityHelp";
export { EquipmentAvailabilityLookup } from "./components/EquipmentAvailabilityLookup";
export { MarkAvailableDialog } from "./components/MarkAvailableDialog";
export { DocumentAttachments } from "./components/forklift-detail/DocumentAttachments";
export { useAssignForklift, useQuoteAssignments, useUnassignForklift } from "./hooks/forklifts/useAssignForklifts";
export { useAvailableForklifts } from "./hooks/forklifts/useAvailableForklifts";
export { useForkliftMap } from "./hooks/forklifts/useForkliftMap";
export { type Forklift, useForklift, useForklifts } from "./hooks/forklifts/useForklifts";
export { useSaleAvailableForklifts } from "./hooks/forklifts/useSaleAvailableForklifts";
export {
  type Driver,
  useActiveDrivers,
  useCreateDriver,
  useDeleteDriver,
  useDrivers,
  useUpdateDriver,
} from "./hooks/useDrivers";
export {
  type EquipmentModel,
  useActivateEquipmentModel,
  useDeleteEquipmentModel,
  useEquipmentModelCatalog,
  useEquipmentModels,
  useUpdateEquipmentModel,
} from "./hooks/useEquipmentModels";
export { type InsuranceAlertsData, useInsuranceAlerts } from "./hooks/useInsuranceAlerts";
export { forkliftKeys, quoteAssignedForkliftKeys, statusLogKeys } from "./lib/queryKeys";
