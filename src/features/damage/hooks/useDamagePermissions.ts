import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";

export interface DamagePermissions {
  canManageDamage: boolean;
  canChargeDamage: boolean;
  damageBlockReason?: string;
  chargeBlockReason?: string;
}

/**
 * R6-FE-01 (N6-MEC-01/N6-MEC-06): gate por permiso real de módulo.
 * Mientras cargan los permisos, fail-closed (mejor deshabilitado que roto).
 */
export function useDamagePermissions(): DamagePermissions {
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();

  const canManageDamage = !!perms && getAccessLevel(perms, role ?? undefined, "Daños") === "full";
  const canChargeDamage = !!perms && getAccessLevel(perms, role ?? undefined, "Facturas") === "full";

  return {
    canManageDamage,
    canChargeDamage,
    damageBlockReason: canManageDamage
      ? undefined
      : "Tu rol no puede modificar daños (se requiere acceso completo al módulo Daños)",
    chargeBlockReason: canChargeDamage
      ? undefined
      : "Tu rol no tiene acceso a Facturas; pide a administración que genere el cobro",
  };
}

/**
 * Condiciones reales de `soft_delete_damage_record`: cargo facturado
 * (invoice_id) o reparado sin cargo.
 */
export function damageArchiveBlockReason(record: { invoice_id: string | null; status: string }) {
  const canArchive = record.invoice_id != null || record.status === "repaired";
  return {
    canArchive,
    archiveBlockReason: canArchive
      ? undefined
      : "Para archivar, primero factura el cargo (Cobrar) o marca el daño como reparado",
  };
}
