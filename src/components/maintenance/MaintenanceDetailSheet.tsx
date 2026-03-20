import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/components/RoleGuard";
import { MaintenancePartsSection } from "@/components/maintenance/MaintenancePartsSection";
import { useDeleteMaintenanceLog } from "@/hooks/useMaintenanceLogs";
import { useSuppliers } from "@/hooks/useSuppliers";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { Pencil, Trash2, Wrench, Calendar, User, DollarSign, Truck, FileText } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceLog } from "@/hooks/useMaintenanceLogs";

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
        toast.success("Registro de mantenimiento eliminado");
        onOpenChange(false);
      },
    });
  };

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {log.service_type}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Badge variant={status.variant}>{status.label}</Badge>

          <div className="space-y-1">
            <DetailRow icon={Truck} label="Montacargas" value={forkliftName} />
            <DetailRow icon={Calendar} label="Fecha de Servicio" value={formatDateDisplay(log.performed_at)} />
            <DetailRow icon={User} label="Realizado Por" value={log.performed_by} />
            <DetailRow icon={DollarSign} label="Costo" value={formatCurrency(log.cost || 0)} />
            <DetailRow icon={Calendar} label="Próximo Servicio" value={formatDateDisplay(log.next_service_date)} />
            {supplier && <DetailRow icon={Truck} label="Proveedor" value={supplier.name} />}
          </div>

          {log.description && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Descripción</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{log.description}</p>
              </div>
            </>
          )}

          <Separator />
          <MaintenancePartsSection maintenanceLogId={log.id} />

          <Separator />
          <RoleGuard module="Mantenimiento" minAccess="full">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { onEdit(log); onOpenChange(false); }}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar registro de mantenimiento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminará permanentemente el registro de "{log.service_type}" del {formatDateDisplay(log.performed_at)}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleteLog.isPending}>
                      {deleteLog.isPending ? "Eliminando..." : "Eliminar"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </RoleGuard>
        </div>
      </SheetContent>
    </Sheet>
  );
}
