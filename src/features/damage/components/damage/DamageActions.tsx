import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateMaintenanceLog } from "@/features/maintenance";
import { maintenanceLogKeys } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import type { DamageRecordWithJoins } from "@/types/rental";
import { damageArchiveBlockReason, useDamagePermissions } from "../../hooks/useDamagePermissions";
import { damageRecordQueries, useArchiveDamageRecord, useUpdateDamageRecord } from "../../hooks/useDamageRecords";
import { useStartRepairWorkOrder } from "../../hooks/useStartRepairWorkOrder";
import { chargeableDamageCost } from "../../lib/chargeableDamageCost";
import { DamageActionButtons, DamageBlockReasons } from "./DamageActionButtons";

interface DamageActionsProps {
  record: DamageRecordWithJoins;
  /** GUI-FE-06 (G-UX-05): el sheet padre pasa esto para cerrarse tras archivar. */
  onClose?: () => void;
}

export function DamageActions({ record, onClose }: DamageActionsProps) {
  const navigate = useNavigateTransition();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateDamage = useUpdateDamageRecord();
  const createMaintenance = useCreateMaintenanceLog();
  const archiveDamage = useArchiveDamageRecord();
  const { tryStartRepairWorkOrder } = useStartRepairWorkOrder();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { canManageDamage, canChargeDamage, damageBlockReason, chargeBlockReason } = useDamagePermissions();
  const { canArchive, archiveBlockReason } = damageArchiveBlockReason(record);

  const handleCreateWorkOrder = async () => {
    try {
      const handledByRpc = await tryStartRepairWorkOrder(record);
      if (handledByRpc) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: damageRecordQueries.keys.all }),
          queryClient.invalidateQueries({ queryKey: maintenanceLogKeys.all }),
        ]);
        notifySuccess("Orden de mantenimiento creada");
        return;
      }
    } catch (err) {
      notifyError({ error: err, title: "No se pudo crear la orden de reparación" });
      return;
    }
    // Fallback (RPC aún no desplegado): flujo legado de dos mutaciones.
    // FIX-R2-05 (03-FIX-01 residual): el importe va en manual_cost; el trigger
    // recalc_maintenance_log_cost pisa `cost` a 0 sin partes/labor.
    createMaintenance.mutate(
      { forklift_id: record.forklift_id, service_type: "Reparación de Daño", description: record.description, manual_cost: record.estimated_cost || 0, performed_by: user?.email ?? null },
      { onSuccess: (data) => { updateDamage.mutate({ id: record.id, status: "in_repair", maintenance_log_id: data.id }); notifySuccess("Orden de mantenimiento creada"); } }
    );
  };

  // R17-G: permitir cerrar un daño sin factura (equipo reparado internamente).
  // F6: la misma transición aplica desde `reported` (reparación interna sin OT);
  // el handler es agnóstico al status previo — solo sella repaired_at.
  const handleMarkRepaired = () => {
    updateDamage.mutate(
      // R7-FE-03 (N7-MOV-08): el FE sella `repaired_at`.
      { id: record.id, status: "repaired", repaired_at: new Date().toISOString() },
      { onSuccess: () => notifySuccess("Daño marcado como reparado") },
    );
  };

  const cost = chargeableDamageCost(record);
  const showCharge = record.status === "repaired" || record.status === "reported";
  const handleCreateInvoice = () => {
    // A-3b/C-4: defensa extra por si comparten la URL.
    if (record.status === "invoiced") return;
    if (!record.customer_id) {
      notifyError({ title: "El daño no tiene cliente asociado" });
      return;
    }
    navigate(`/invoices/new?damage_id=${record.id}&customer_id=${record.customer_id}`);
  };

  if (record.status === "invoiced" && !canArchive) {
    return <span className="text-xs text-muted-foreground">Completo</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DamageActionButtons
        status={record.status}
        canManageDamage={canManageDamage}
        canChargeDamage={canChargeDamage}
        canArchive={canArchive}
        canCharge={showCharge}
        costMissing={cost == null}
        damageBlockReason={damageBlockReason}
        chargeBlockReason={chargeBlockReason}
        archiveBlockReason={archiveBlockReason}
        isCreatingWorkOrder={createMaintenance.isPending}
        isUpdating={updateDamage.isPending}
        isArchiving={archiveDamage.isPending}
        onCreateWorkOrder={() => { void handleCreateWorkOrder(); }}
        onMarkRepaired={handleMarkRepaired}
        onCreateInvoice={handleCreateInvoice}
        onArchive={() => setArchiveOpen(true)}
      />
      <DamageBlockReasons
        status={record.status}
        showCharge={showCharge}
        damageBlockReason={damageBlockReason}
        chargeBlockReason={chargeBlockReason}
        archiveBlockReason={archiveBlockReason}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="¿Archivar este daño?"
        description="El daño se ocultará de los listados activos y el montacargas volverá a un estado coherente (si no tiene otra renta o mantenimiento abierto). Se conserva el rastro en auditoría."
        confirmLabel="Archivar"
        destructive
        loading={archiveDamage.isPending}
        onConfirm={() =>
          archiveDamage.mutate(record.id, {
            onSuccess: () => {
              notifySuccess("Daño archivado");
              // GUI-FE-06b (G-UX-05): cerrar el sheet tras archivar.
              onClose?.();
            },
          })
        }
      />
    </div>
  );
}
