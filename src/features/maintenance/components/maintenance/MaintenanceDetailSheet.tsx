import { Activity, useState } from "react";
import { DetailRow } from "@/components/domain/DetailRow";
import { EditIcon, DeleteIcon, MaintenanceIcon, CalendarIcon, UserIcon, CostIcon, FleetIcon, DocumentIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSuppliers } from "@/features/suppliers";
import { RoleGuard } from "@/layouts/RoleGuard";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { formatDateDisplay } from "@/lib/utils";
import { useDeleteMaintenanceLog } from "../../hooks/maintenance/useMaintenanceLogs";
import { MaintenanceLaborSection } from "./MaintenanceLaborSection";
import { MaintenancePartsSection } from "./MaintenancePartsSection";
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
  const { data: suppliers } = useSuppliers();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!log) return null;

  const supplier = suppliers?.find((s) => s.id === log.supplier_id);
  const status = STATUS_LABELS[log.work_status] || { label: log.work_status, variant: "secondary" as const };

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
            {log.service_type}
          </SheetTitle>
        </SheetHeader>

        <Activity mode={open ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <Badge variant={status.variant}>{status.label}</Badge>

          <div className="space-y-1">
            <DetailRow icon={FleetIcon} label="Montacargas" value={forkliftName} />
            <DetailRow icon={CalendarIcon} label="Fecha de Servicio" value={formatDateDisplay(log.performed_at)} />
            <DetailRow icon={UserIcon} label="Realizado Por" value={log.performed_by} />
            <DetailRow icon={CostIcon} label="Costo" value={formatCurrency(log.cost || 0)} />
            <DetailRow icon={CalendarIcon} label="Próximo Servicio" value={formatDateDisplay(log.next_service_date)} />
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
          <MaintenancePartsSection maintenanceLogId={log.id} currentCost={log.cost || 0} />

          <Separator />
          <RoleGuard module="Mantenimiento" minAccess="full">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { onEdit(log); onOpenChange(false); }}>
                <EditIcon className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => setConfirmOpen(true)}>
                <DeleteIcon className="h-4 w-4 mr-1" /> Archivar
              </Button>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="¿Archivar registro de mantenimiento?"
                description={`Se ocultará de los listados pero se conservará el historial del servicio "${log.service_type}" del ${formatDateDisplay(log.performed_at)} para auditoría.`}
                confirmLabel="Archivar"
                destructive
                loading={deleteLog.isPending}
                onConfirm={handleDelete}
              />
            </div>
          </RoleGuard>
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
