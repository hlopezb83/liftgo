// Barrel público de la feature "users".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { AuthSnapshotSync } from "./components/AuthSnapshotSync";
export {
  type AccessLevel,
  getAccessLevel,
  getNavigationAccessLevel,
  hasFinancialAccess,
  MODULES,
  type PermissionsMap,
  useRolePermissions,
} from "./hooks/useRolePermissions";
export { type AppRole, useUserRole } from "./hooks/useUserRole";
export { useHasFinancialAccess, useHasModuleAccess } from "./hooks/useHasModuleAccess";
