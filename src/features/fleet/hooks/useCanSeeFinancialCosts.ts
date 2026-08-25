import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";

/**
 * H-9: tarifas, costo de adquisición y costo de póliza son datos financieros
 * sensibles. Hoy las policies de `forklifts` devuelven la fila completa a
 * mecánico, despachador, ventas y auditor, así que el gating vive en la UI.
 *
 * Fail-closed: mientras los permisos cargan devuelve `false` (mejor ocultar de
 * más un instante que filtrar el costo de compra del equipo).
 */
export function useCanSeeFinancialCosts(): boolean {
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  if (!perms || !role) return false;
  if (role === "admin" || role === "administrativo") return true;
  return getAccessLevel(perms, role, "Facturas") === "full";
}
