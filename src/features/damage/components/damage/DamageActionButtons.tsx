import { BlockedActionButton } from "@/components/feedback/BlockedActionButton";
import { MaintenanceIcon, InvoiceIcon, SuccessIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";

interface DamageActionButtonsProps {
  status: string;
  canManageDamage: boolean;
  canChargeDamage: boolean;
  canArchive: boolean;
  canCharge: boolean;
  costMissing: boolean;
  damageBlockReason?: string;
  chargeBlockReason?: string;
  /** Bloqueo explicable de archivado (daño aún abierto). */
  archiveBlock?: BusinessBlock | null;
  isCreatingWorkOrder: boolean;
  isUpdating: boolean;
  isArchiving: boolean;
  onCreateWorkOrder: () => void;
  onMarkRepaired: () => void;
  onCreateInvoice: () => void;
  onArchive: () => void;
}


/** Botonera pura del panel de daños (sin lógica de permisos ni mutaciones). */
export function DamageActionButtons({
  status,
  canManageDamage,
  canChargeDamage,
  canArchive,
  canCharge,
  costMissing,
  damageBlockReason,
  chargeBlockReason,
  archiveBlock = null,
  isCreatingWorkOrder,
  isUpdating,
  isArchiving,
  onCreateWorkOrder,
  onMarkRepaired,
  onCreateInvoice,
  onArchive,
}: DamageActionButtonsProps) {
  return (
    <>
      {status === "reported" && (
        <span title={damageBlockReason}>
          <Button variant="ghost" size="sm" onClick={onCreateWorkOrder} disabled={!canManageDamage || isCreatingWorkOrder}>
            <MaintenanceIcon className="h-3.5 w-3.5 mr-1" />Reparar
          </Button>
        </span>
      )}
      {/* F6: un daño `reported` reparado internamente sin OT quedaba en callejón
          sin salida (archivar exige invoice_id o status repaired). Se permite la
          transición reported → repaired con el mismo botón/permiso que in_repair. */}
      {(status === "in_repair" || status === "reported") && (
        <span title={damageBlockReason}>
          <Button variant="ghost" size="sm" onClick={onMarkRepaired} disabled={!canManageDamage || isUpdating}>
            <SuccessIcon className="h-3.5 w-3.5 mr-1" />Marcar reparado
          </Button>
        </span>
      )}
      {canCharge && (
        <span title={chargeBlockReason}>
          <Button variant="ghost" size="sm" onClick={onCreateInvoice} disabled={costMissing || !canChargeDamage}>
            <InvoiceIcon className="h-3.5 w-3.5 mr-1" />Cobrar
          </Button>
        </span>
      )}
      {/* El bloqueo de archivado (daño aún abierto) usa la primitiva compartida;
          el permiso de rol se sigue manejando con `canManageDamage`. */}
      <BlockedActionButton
        variant="ghost"
        size="sm"
        block={archiveBlock}
        disabled={!canManageDamage || !canArchive || isArchiving}
        onClick={onArchive}
      >
        <DeleteIcon className="h-3.5 w-3.5 mr-1" />Archivar
      </BlockedActionButton>

    </>
  );
}

interface DamageBlockReasonsProps {
  status: string;
  showCharge: boolean;
  damageBlockReason?: string;
  chargeBlockReason?: string;
  archiveBlockReason?: string;
}

/**
 * GUI-FE-06c (G-UX-09) + R6-FE-01: razones de bloqueo siempre visibles,
 * no sólo como tooltip del botón deshabilitado.
 */
export function DamageBlockReasons({
  status,
  showCharge,
  damageBlockReason,
  chargeBlockReason,
  archiveBlockReason,
}: DamageBlockReasonsProps) {
  const reasons = [
    archiveBlockReason,
    status !== "invoiced" ? damageBlockReason : undefined,
    showCharge ? chargeBlockReason : undefined,
  ].filter((r): r is string => !!r);

  return (
    <>
      {reasons.map((reason) => (
        <p key={reason} className="basis-full text-xs text-muted-foreground">{reason}</p>
      ))}
    </>
  );
}
