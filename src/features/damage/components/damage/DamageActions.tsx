import { useState } from "react";
import { MaintenanceIcon, InvoiceIcon, SuccessIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCreateMaintenanceLog } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import type { DamageRecordWithJoins } from "@/types/rental";
import { useArchiveDamageRecord, useUpdateDamageRecord } from "../../hooks/useDamageRecords";
import { chargeableDamageCost } from "../../lib/chargeableDamageCost";

interface DamageActionsProps { record: DamageRecordWithJoins; }

export function DamageActions({ record }: DamageActionsProps) {
  const navigate = useNavigateTransition();
  const updateDamage = useUpdateDamageRecord();
  const createMaintenance = useCreateMaintenanceLog();
  const archiveDamage = useArchiveDamageRecord();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const handleCreateWorkOrder = () => {
    createMaintenance.mutate(
      { forklift_id: record.forklift_id, service_type: "Reparación de Daño", description: record.description, cost: record.estimated_cost || 0 },
      { onSuccess: (data) => { updateDamage.mutate({ id: record.id, status: "in_repair", maintenance_log_id: data.id }); notifySuccess("Orden de mantenimiento creada"); } }
    );
  };

  // R17-G: permitir cerrar un daño sin factura (equipo reparado internamente).
  // Sólo aplica cuando ya está en reparación; deja el daño en `repaired` para
  // que "Cobrar" siga siendo opcional.
  const handleMarkRepaired = () => {
    updateDamage.mutate(
      { id: record.id, status: "repaired" },
      { onSuccess: () => notifySuccess("Daño marcado como reparado") },
    );
  };

  const cost = chargeableDamageCost(record);
  const handleCreateInvoice = () => {
    // A-3b/C-4: defensa extra por si comparten la URL — el botón ya se oculta
    // en status invoiced, pero validamos también en click.
    if (record.status === "invoiced") return;
    if (!record.customer_id) {
      notifyError({ title: "El daño no tiene cliente asociado" });
      return;
    }
    navigate(`/invoices/new?damage_id=${record.id}&customer_id=${record.customer_id}&amount=${cost ?? ""}`);
  };

  // Condiciones reales de soft_delete_damage_record: cargo facturado
  // (invoice_id) o reparado sin cargo. Invoiced sin invoice_id (dato legado)
  // sigue siendo "Completo" sin acciones.
  const canArchive = record.invoice_id != null || record.status === "repaired";
  const archiveBlockReason = canArchive
    ? undefined
    : "Para archivar, primero factura el cargo (Cobrar) o marca el daño como reparado";

  if (record.status === "invoiced" && !canArchive) {
    return <span className="text-xs text-muted-foreground">Completo</span>;
  }

  return (
    <div className="flex gap-1">
      {record.status === "reported" && (
        <Button variant="ghost" size="sm" onClick={handleCreateWorkOrder} disabled={createMaintenance.isPending}>
          <MaintenanceIcon className="h-3.5 w-3.5 mr-1" />Reparar
        </Button>
      )}
      {record.status === "in_repair" && (
        <Button variant="ghost" size="sm" onClick={handleMarkRepaired} disabled={updateDamage.isPending}>
          <SuccessIcon className="h-3.5 w-3.5 mr-1" />Marcar reparado
        </Button>
      )}
      {(record.status === "repaired" || record.status === "reported") && (
        <Button variant="ghost" size="sm" onClick={handleCreateInvoice} disabled={cost == null}>
          <InvoiceIcon className="h-3.5 w-3.5 mr-1" />Cobrar
        </Button>
      )}
      <span title={archiveBlockReason}>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canArchive || archiveDamage.isPending}
          onClick={() => setArchiveOpen(true)}
        >
          <DeleteIcon className="h-3.5 w-3.5 mr-1" />Archivar
        </Button>
      </span>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="¿Archivar este daño?"
        description="El daño se ocultará de los listados activos y el montacargas volverá a un estado coherente (si no tiene otra renta o mantenimiento abierto). Se conserva el rastro en auditoría."
        confirmLabel="Archivar"
        destructive
        loading={archiveDamage.isPending}
        onConfirm={() => archiveDamage.mutate(record.id, { onSuccess: () => notifySuccess("Daño archivado") })}
      />
    </div>
  );
}
