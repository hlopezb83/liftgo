import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MaintenanceIcon, InvoiceIcon, SuccessIcon, DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCreateMaintenanceLog } from "@/features/maintenance";
import { maintenanceLogKeys } from "@/features/maintenance/lib/queryKeys";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import type { DamageRecordWithJoins } from "@/types/rental";
import { damageRecordQueries, useArchiveDamageRecord, useUpdateDamageRecord } from "../../hooks/useDamageRecords";
import { chargeableDamageCost } from "../../lib/chargeableDamageCost";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";

interface DamageActionsProps {
  record: DamageRecordWithJoins;
  /** GUI-FE-06 (G-UX-05): el sheet padre pasa esto para cerrarse tras archivar. */
  onClose?: () => void;
}

/**
 * GUI-FE-06d (G-MEC-03): intenta el RPC atómico `start_repair_work_order`
 * (GUI-DB-09: INSERT maintenance_log + UPDATE damage_record en una sola
 * transacción, SECURITY DEFINER → también funciona para mechanic, G-MEC-02).
 * Devuelve `false` si la función aún no existe en este entorno para que el
 * caller use el flujo legado; lanza cualquier otro error real.
 */
async function tryStartRepairWorkOrderRpc(record: DamageRecordWithJoins): Promise<boolean> {
  const { error } = await supabase.rpc("start_repair_work_order", {
    p_damage_id: record.id,
    p_service_type: "Reparación de Daño",
    p_description: record.description,
    p_estimated_cost: record.estimated_cost ?? 0,
  });
  if (!error) return true;
  const missingRpc =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /schema cache|could not find the function/i.test(error.message ?? "");
  if (missingRpc) return false;
  throw error;
}

export function DamageActions({ record, onClose }: DamageActionsProps) {
  const navigate = useNavigateTransition();
  const queryClient = useQueryClient();
  const updateDamage = useUpdateDamageRecord();
  const createMaintenance = useCreateMaintenanceLog();
  const archiveDamage = useArchiveDamageRecord();
  const [archiveOpen, setArchiveOpen] = useState(false);

  // R6-FE-01 (N6-MEC-01/N6-MEC-06): gate por permiso real de módulo.
  // Sin esto, mechanic/ventas/dispatcher veían "Cobrar"/"Archivar"/"Reparar"
  // y la mutación moría en RLS (200 [] silencioso o error críptico).
  // Matriz (seed 20260313001007): mechanic Daños=full / Facturas=none;
  // dispatcher Daños=none; ventas Daños=none; auditor read-only.
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();
  // Mientras cargan los permisos, fail-closed (mejor deshabilitado que roto).
  const canManageDamage = !!perms && getAccessLevel(perms, role ?? undefined, "Daños") === "full";
  const canChargeDamage = !!perms && getAccessLevel(perms, role ?? undefined, "Facturas") === "full";
  // "Marcar reparado" usa UPDATE damage_records: permitido a mechanic solo
  // cuando el daño ya está en reparación (UPDATE habilitado por R6-DB-01).
  const damageBlockReason = canManageDamage
    ? undefined
    : "Tu rol no puede modificar daños (se requiere acceso completo al módulo Daños)";
  const chargeBlockReason = canChargeDamage
    ? undefined
    : "Tu rol no tiene acceso a Facturas; pide a administración que genere el cobro";

  const handleCreateWorkOrder = async () => {
    try {
      const handledByRpc = await tryStartRepairWorkOrderRpc(record);
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
    // Para roles SELECT-only en damage_records la segunda mutación puede
    // afectar 0 filas (OT huérfana) — de ahí la prioridad del RPC atómico.
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
      // R7-FE-03 (N7-MOV-08): el FE sella `repaired_at` — ningún trigger lo
      // setea; la migración R6-DB-01 (20260730200505) solo dio GRANT UPDATE.
      { id: record.id, status: "repaired", repaired_at: new Date().toISOString() },
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
    <div className="flex flex-wrap gap-2">
      {record.status === "reported" && (
        <span title={damageBlockReason}>
          <Button variant="ghost" size="sm" onClick={handleCreateWorkOrder} disabled={!canManageDamage || createMaintenance.isPending}>
            <MaintenanceIcon className="h-3.5 w-3.5 mr-1" />Reparar
          </Button>
        </span>
      )}
      {record.status === "in_repair" && (
        <span title={damageBlockReason}>
          <Button variant="ghost" size="sm" onClick={handleMarkRepaired} disabled={!canManageDamage || updateDamage.isPending}>
            <SuccessIcon className="h-3.5 w-3.5 mr-1" />Marcar reparado
          </Button>
        </span>
      )}
      {(record.status === "repaired" || record.status === "reported") && (
        <span title={chargeBlockReason}>
          <Button variant="ghost" size="sm" onClick={handleCreateInvoice} disabled={cost == null || !canChargeDamage}>
            <InvoiceIcon className="h-3.5 w-3.5 mr-1" />Cobrar
          </Button>
        </span>
      )}
      <span title={archiveBlockReason}>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canManageDamage || !canArchive || archiveDamage.isPending}
          onClick={() => setArchiveOpen(true)}
        >
          <DeleteIcon className="h-3.5 w-3.5 mr-1" />Archivar
        </Button>
      </span>
      {/* GUI-FE-06c (G-UX-09): la razón del bloqueo siempre visible,
          no sólo como tooltip del botón deshabilitado. */}
      {archiveBlockReason && (
        <p className="basis-full text-xs text-muted-foreground">{archiveBlockReason}</p>
      )}
      {/* R6-FE-01: razones de bloqueo por rol siempre visibles (mismo patrón
          que `archiveBlockReason` de GUI-FE-06c). */}
      {damageBlockReason && record.status !== "invoiced" && (
        <p className="basis-full text-xs text-muted-foreground">{damageBlockReason}</p>
      )}
      {chargeBlockReason && (record.status === "repaired" || record.status === "reported") && (
        <p className="basis-full text-xs text-muted-foreground">{chargeBlockReason}</p>
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
