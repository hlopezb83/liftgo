import { Activity, useState } from "react";
import { DetailRow } from "@/components/domain/DetailRow";
import { EditIcon, DeleteIcon, MaintenanceIcon, CalendarIcon, UserIcon, CostIcon, FleetIcon, DocumentIcon, SuccessIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSuppliers } from "@/features/suppliers";
import { useUserRole } from "@/features/users";
import { RoleGuard } from "@/layouts/RoleGuard";
import { serviceTypeLabel } from "@/lib/constants";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useDeleteMaintenanceLog, useRestoreMaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";
import { CloseWorkOrderDialog } from "./CloseWorkOrderDialog";
import { MaintenanceLaborSection } from "./MaintenanceLaborSection";
import { MaintenancePartsSection } from "./MaintenancePartsSection";
import { ReopenWorkOrderDialog } from "./ReopenWorkOrderDialog";
import type { MaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";


const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  in_progress: { label: "En Progreso", variant: "default" },
  waiting_parts: { label: "Esperando Refacciones", variant: "outline" },
  completed: { label: "Completado", variant: "secondary" },
};

interface Props {
  log: MaintenanceLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forkliftName: string;
  onEdit: (log: MaintenanceLog) => void;
}

export function MaintenanceDetailSheet({ log, open, onOpenChange, forkliftName, onEdit }: Props) {
  const deleteLog = useDeleteMaintenanceLog();
  const restoreLog = useRestoreMaintenanceLog();
  // E1: una OT cerrada ya trae costos capturados; solo admin puede archivarla
  // (el RPC lo valida en el servidor, aqui evitamos el intento fallido).
  const { data: role } = useUserRole();
  const { data: suppliers } = useSuppliers();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  if (!log) return null;

  const supplier = suppliers?.find((s) => s.id === log.supplier_id);
  const status = STATUS_LABELS[log.work_status] || { label: log.work_status, variant: "secondary" as const };
  const isClosed = log.work_status === "completed";
  const isArchived = log.deleted_at !== null;

  const handleDelete = () => {
    deleteLog.mutate(log.id, {
      onSuccess: () => {
        notifySuccess("Registro de mantenimiento eliminado");
        onOpenChange(false);
      },
    });
  };




  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MaintenanceIcon className="h-5 w-5" />
            {serviceTypeLabel(log.service_type)}
          </SheetTitle>
        </SheetHeader>

        <Activity mode={open ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <Badge variant={status.variant}>{status.label}</Badge>

          {isClosed && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-sm">OT cerrada el {formatDateMty(log.performed_at)}</span>
              <span className="font-mono text-sm font-semibold">{formatCurrency(log.cost || 0)}</span>
            </div>
          )}


          <div className="space-y-1">
            <DetailRow icon={FleetIcon} label="Montacargas" value={forkliftName} />
            <DetailRow icon={CalendarIcon} label="Fecha de Servicio" value={formatDateMty(log.performed_at)} />
            <DetailRow icon={UserIcon} label="Realizado Por" value={log.performed_by} />
            <DetailRow icon={CostIcon} label="Costo" value={formatCurrency(log.cost || 0)} />
            <DetailRow icon={CalendarIcon} label="Próximo Servicio" value={formatDateMty(log.next_service_date)} />
            {supplier && <DetailRow icon={FleetIcon} label="Proveedor" value={supplier.name} />}
          </div>

          {log.description && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DocumentIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Descripción</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{log.description}</p>
              </div>
            </>
          )}

          <Separator />
          <MaintenancePartsSection
            maintenanceLogId={log.id}
            currentCost={log.cost || 0}
            readOnly={log.work_status === "completed"}
          />

          <Separator />
          <MaintenanceLaborSection
            maintenanceLogId={log.id}
            readOnly={log.work_status === "completed"}
          />

          <Separator />
          <RoleGuard module="Mantenimiento" minAccess="full" fallback={null}>
            {isArchived ? (
              // R5-A6: una OT archivada solo admite restaurarse (solo admin).
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Esta orden está archivada. Sus refacciones y mano de obra se conservan.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={role !== "admin" || restoreLog.isPending}
                  title={role !== "admin" ? "Solo un administrador puede restaurar" : undefined}
                  onClick={() => restoreLog.mutate(log.id, { onSuccess: () => onOpenChange(false) })}
                >
                  <MaintenanceIcon className="h-4 w-4 mr-1" /> Restaurar orden
                </Button>
              </div>
            ) : (
              <MaintenanceDetailActions
                log={log}
                forkliftName={forkliftName}
                isClosed={isClosed}
                canArchiveClosed={role === "admin"}
                deletePending={deleteLog.isPending}
                closeOpen={closeOpen}
                onCloseOpenChange={setCloseOpen}
                confirmOpen={confirmOpen}
                onConfirmOpenChange={setConfirmOpen}
                onEdit={() => { onEdit(log); onOpenChange(false); }}
                onDelete={handleDelete}
                onSheetClose={() => onOpenChange(false)}
              />
            )}
          </RoleGuard>
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}

interface ActionsProps {
  log: MaintenanceLog;
  forkliftName: string;
  isClosed: boolean;
  /** E1: solo admin puede archivar una OT cerrada (el RPC lo valida también). */
  canArchiveClosed: boolean;
  deletePending: boolean;
  closeOpen: boolean;
  onCloseOpenChange: (open: boolean) => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSheetClose: () => void;
}

function MaintenanceDetailActions({
  log, forkliftName, isClosed, canArchiveClosed, deletePending,
  closeOpen, onCloseOpenChange, confirmOpen, onConfirmOpenChange,
  onEdit, onDelete, onSheetClose,
}: ActionsProps) {
  const archiveBlocked = isClosed && !canArchiveClosed;
  // A1 (R5): la RPC `reopen_work_order` existía sin ningún llamador en la app.
  // Solo admin y solo sobre una OT cerrada; el servidor revalida ambas cosas.
  const [reopenOpen, setReopenOpen] = useState(false);
  const canReopen = isClosed && canArchiveClosed;
  return (
    <>
      {!isClosed && (
        <Button className="w-full mb-2" onClick={() => onCloseOpenChange(true)}>
          <SuccessIcon className="h-4 w-4 mr-1" /> Cerrar OT
        </Button>
      )}
      {canReopen && (
        <Button variant="outline" className="w-full mb-2" onClick={() => setReopenOpen(true)}>
          <MaintenanceIcon className="h-4 w-4 mr-1" /> Reabrir OT
        </Button>
      )}
      <ReopenWorkOrderDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        log={{ ...log, forklift_name: forkliftName }}
      />
      <CloseWorkOrderDialog
        open={closeOpen}
        onOpenChange={onCloseOpenChange}
        log={{ ...log, forklift_name: forkliftName }}
        onClosed={onSheetClose}
      />

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onEdit}>
          <EditIcon className="h-4 w-4 mr-1" /> Editar
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={archiveBlocked}
          title={archiveBlocked ? "La orden esta cerrada: solo un administrador puede archivarla" : undefined}
          onClick={() => onConfirmOpenChange(true)}
        >
          <DeleteIcon className="h-4 w-4 mr-1" /> Archivar
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={onConfirmOpenChange}
          title="¿Archivar registro de mantenimiento?"
          description={`${isClosed ? "La orden está cerrada: se conservan sus refacciones y mano de obra. " : ""}Se ocultará de los listados pero se conservará el historial del servicio "${serviceTypeLabel(log.service_type)}" del ${formatDateMty(log.performed_at)} para auditoría.`}
          confirmLabel="Archivar"
          destructive
          loading={deletePending}
          onConfirm={onDelete}
        />
      </div>
    </>
  );
}
