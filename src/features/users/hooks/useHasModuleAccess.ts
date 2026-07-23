import { getAccessLevel, useRolePermissions, type AccessLevel } from "./useRolePermissions";
import { useUserRole } from "./useUserRole";

/**
 * R12-M7: helper para gatear acciones (topbar, empty state) fuera del árbol
 * de `RoleGuard`. Devuelve `true` solo cuando el rol activo satisface
 * `minAccess` para el `module`. Mientras cargan permisos/rol devuelve `false`
 * para no filtrar acciones prematuramente.
 */
const ACCESS_ORDER: AccessLevel[] = ["none", "read", "full"];

export function useHasModuleAccess(module: string, minAccess: AccessLevel = "read"): boolean {
  const { data: role, isLoading: roleLoading, isError: roleError } = useUserRole();
  const { data: perms, isLoading: permsLoading, isError: permsError } = useRolePermissions();

  if (roleLoading || permsLoading || roleError || permsError) return false;
  if (!role || !perms) return false;

  const level = getAccessLevel(perms, role, module);
  return ACCESS_ORDER.indexOf(level) >= ACCESS_ORDER.indexOf(minAccess);
}
