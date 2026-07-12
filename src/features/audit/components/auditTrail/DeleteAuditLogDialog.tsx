import { FormDialog } from "@/components/forms/FormDialog";
import { DeleteIcon, WarnIcon, UndoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { translateAction, translateTable, formatTimestamp, getRecordLabel } from "./auditTrailConstants";
import type { AuditLog } from "../../hooks/useAuditLogs";

interface Props {
  log: AuditLog | null;
  isDeleting: boolean;
  isReverting: boolean;
  onClose: () => void;
  onDelete: (log: AuditLog) => void;
  onRevert: (log: AuditLog) => void;
}

function isRevertDisabled(log: AuditLog): boolean {
  if (log.action === "DELETE" && !log.old_data) return true;
  if (log.action === "UPDATE" && !log.old_data) return true;
  return false;
}

function revertHint(log: AuditLog): string {
  if (log.action === "INSERT") return "Esto eliminará el registro creado de la tabla original.";
  if (log.action === "UPDATE") return "Esto restaurará los valores anteriores en la base de datos.";
  if (log.old_data) return "Esto re-creará el registro eliminado en la base de datos.";
  return "No se puede revertir: no hay datos anteriores disponibles.";
}

export function DeleteAuditLogDialog({ log, isDeleting, isReverting, onClose, onDelete, onRevert }: Props) {
  const isPending = isDeleting || isReverting;

  return (
    <FormDialog
      open={!!log}
      onOpenChange={(open) => !open && !isPending && onClose()}
      width="md"
      title="Eliminar registro de bitácora"
    >
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
              <DeleteIcon className="h-4 w-4 mr-2" />
              {isDeleting ? "Eliminando…" : "Solo borrar de bitácora"}
            </Button>

            <div className="relative">
              <Button
                variant="destructive"
                className="w-full justify-start"
                disabled={isPending || isRevertDisabled(log)}
                onClick={() => onRevert(log)}
              >
                <UndoIcon className="h-4 w-4 mr-2" />
                {isReverting ? "Revirtiendo…" : "Revertir acción original"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                <WarnIcon className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                {revertHint(log)}
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
    </FormDialog>
  );
}
