import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { businessBlockSummary, describeBusinessBlock } from "@/lib/rules/businessBlocks";

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
 * Condiciones de `soft_delete_damage_record`: la reparación física debe estar
 * cerrada; si el estado es facturado, además exige una factura consistente.
 */
export function damageArchiveBlockReason(record: {
  invoice_id: string | null;
  repaired_at?: string | null;
  status: string;
}) {
  const repairFinished =
    !!record.repaired_at && (record.status === "repaired" || record.status === "invoiced");
  const billingConsistent = record.status !== "invoiced" || record.invoice_id != null;
  const canArchive = repairFinished && billingConsistent;
  const archiveBlock = canArchive ? null : describeBusinessBlock("damage_not_repaired");
  return {
    canArchive,
    archiveBlock,
    archiveBlockReason: archiveBlock ? businessBlockSummary(archiveBlock) : undefined,
  };
}
