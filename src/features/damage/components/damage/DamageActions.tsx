import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateMaintenanceLog } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import type { DamageRecordWithJoins } from "@/types/rental";
import { damageArchiveBlockReason, useDamagePermissions } from "../../hooks/useDamagePermissions";
import { useArchiveDamageRecord, useUpdateDamageRecord } from "../../hooks/useDamageRecords";
import { useStartRepairWorkOrder } from "../../hooks/useStartRepairWorkOrder";
import { chargeableDamageCost } from "../../lib/chargeableDamageCost";
import { damageInvalidationKeys } from "../../lib/damageInvalidationKeys";
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

  const { canManageDamage, canChargeDamage, canMarkReportedRepaired, canArchiveDamage, damageBlockReason, chargeBlockReason } = useDamagePermissions();
  const { canArchive, archiveBlock, archiveBlockReason } = damageArchiveBlockReason(record);

  const handleCreateWorkOrder = async () => {
    try {
      const handledByRpc = await tryStartRepairWorkOrder(record);
      if (handledByRpc) {
        await Promise.all(damageInvalidationKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
        notifySuccess("Orden de mantenimiento creada");
        return;
      }
    } catch (err) {
      notifyError({ error: err, title: "No se pudo crear la orden de reparación" });
      return;
    }
    // Fallback (RPC aún no desplegado): flujo legado de dos mutaciones.
    // El estimado es presupuesto, no un gasto adicional a partes y mano de obra.
    createMaintenance.mutate(
      { forklift_id: record.forklift_id, service_type: "Reparación de Daño", description: record.description, manual_cost: 0, performed_by: user?.email ?? null },
      { onSuccess: (data) => { updateDamage.mutate({ id: record.id, status: "in_repair", maintenance_log_id: data.id }); notifySuccess("Orden de mantenimiento creada"); } }
    );
  };

  // R17-G: permitir cerrar un daño sin factura (equipo reparado internamente).
  // F6: la misma transición aplica desde `reported` (reparación interna sin OT);
  // el handler es agnóstico al status previo — solo sella repaired_at.
  const handleMarkRepaired = () => {
    if (!canManageDamage || (record.status === "reported" && !canMarkReportedRepaired)) return;
    updateDamage.mutate(
      // Las filas históricas pudieron quedar `invoiced` sin reparación. En ese
      // caso se conserva el estado de cobro y se sella únicamente la reparación.
      {
        id: record.id,
        status: record.status === "invoiced" ? "invoiced" : "repaired",
        repaired_at: new Date().toISOString(),
      },
      { onSuccess: () => notifySuccess("Daño marcado como reparado") },
    );
  };

  const cost = chargeableDamageCost(record);
  const showCharge = record.status === "repaired";
  const needsRepairCompletion = record.status === "invoiced" && !record.repaired_at;
  const goToInvoiceForm = () => {
    navigate(`/invoices/new?damage_id=${record.id}&customer_id=${record.customer_id}`);
  };

  const handleCreateInvoice = () => {
    // A-3b/C-4: defensa extra por si comparten la URL.
    if (record.status === "invoiced") return;
    if (!record.customer_id) {
      notifyError({ title: "El daño no tiene cliente asociado" });
      return;
    }
    goToInvoiceForm();
  };

  if (record.status === "invoiced" && !canArchive && !needsRepairCompletion) {
    return <span className="text-xs text-muted-foreground">Completo</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DamageActionButtons
        status={record.status}
        canManageDamage={canManageDamage}
        canMarkReportedRepaired={canMarkReportedRepaired}
        showArchive={canArchiveDamage}
        canChargeDamage={canChargeDamage}
        canArchive={canArchive}
        canCharge={showCharge}
        needsRepairCompletion={needsRepairCompletion && canMarkReportedRepaired}
        costMissing={cost == null}
        damageBlockReason={damageBlockReason}
        chargeBlockReason={chargeBlockReason}
        archiveBlock={archiveBlock}
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
        archiveBlockReason={canArchiveDamage ? archiveBlockReason : undefined}
      />
      {canManageDamage && record.status === "reported" && !canMarkReportedRepaired && (
        <p className="basis-full text-xs text-muted-foreground">
          Inicia una orden de reparación antes de marcar este daño como reparado.
        </p>
      )}
      {showCharge && cost == null && canChargeDamage && (
        <p className="basis-full text-xs text-muted-foreground">
          Falta valorar el costo real de reparación. Completa la orden de trabajo o solicita la valoración a administración antes de cobrar.
        </p>
      )}
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
