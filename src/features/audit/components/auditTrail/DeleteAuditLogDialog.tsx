import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, Undo2 } from "lucide-react";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import { translateAction, translateTable, formatTimestamp, getRecordLabel } from "./auditTrailConstants";

interface Props {
  log: AuditLog | null;
  isDeleting: boolean;
  isReverting: boolean;
  onClose: () => void;
  onDelete: (log: AuditLog) => void;
  onRevert: (log: AuditLog) => void;
}

export function DeleteAuditLogDialog({ log, isDeleting, isReverting, onClose, onDelete, onRevert }: Props) {
  const isPending = isDeleting || isReverting;
  return (
    <Dialog open={!!log} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Eliminar registro de bitácora
          </DialogTitle>
        </DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Tabla:</span> {translateTable(log.table_name)}</p>
              <p><span className="text-muted-foreground">Acción:</span> {translateAction(log.action)}</p>
              <p><span className="text-muted-foreground">Fecha:</span> {formatTimestamp(log.created_at)}</p>
              <p><span className="text-muted-foreground">Registro:</span> {getRecordLabel(log)}</p>
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={isPending}
                onClick={() => onDelete(log)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? "Eliminando…" : "Solo borrar de bitácora"}
              </Button>

              <div className="relative">
                <Button
                  variant="destructive"
                  className="w-full justify-start"
                  disabled={isPending || (log.action === 'DELETE' && !log.old_data) || (log.action === 'UPDATE' && !log.old_data)}
                  onClick={() => onRevert(log)}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  {isReverting ? "Revirtiendo…" : "Revertir acción original"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                  {log.action === 'INSERT' && "Esto eliminará el registro creado de la tabla original."}
                  {log.action === 'UPDATE' && "Esto restaurará los valores anteriores en la base de datos."}
                  {log.action === 'DELETE' && (log.old_data
                    ? "Esto re-creará el registro eliminado en la base de datos."
                    : "No se puede revertir: no hay datos anteriores disponibles."
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" disabled={isPending} onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
