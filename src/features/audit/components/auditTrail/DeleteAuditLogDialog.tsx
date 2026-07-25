import { useQuery } from "@tanstack/react-query";
import { FormDialog } from "@/components/forms/FormDialog";
import { WarnIcon, UndoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { translateAction, translateTable, formatTimestamp, getRecordLabel } from "./auditTrailConstants";
import { auditLogDetailQueries } from "../../lib/queryKeys";
import type { AuditLog } from "../../hooks/useAuditLogs";

interface Props {
  log: AuditLog | null;
  isReverting: boolean;
  onClose: () => void;
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

// R14-G: la bitácora es append-only (policies SELECT-only + trigger). Ofrecer
// "Eliminar" era un falso éxito (DELETE no-op por RLS con toast de éxito).
// El diálogo queda sólo para revertir la acción original.
//
// v7.233.0 (P1-4b): la lista no trae old_data; refetch por id aquí para
// habilitar/deshabilitar el botón según haya datos anteriores.
export function DeleteAuditLogDialog({ log, isReverting, onClose, onRevert }: Props) {
  const { data: full, isLoading } = useQuery({
    ...auditLogDetailQueries.list({ id: log?.id ?? "" }),
    enabled: !!log,
  });

  const merged: AuditLog | null = log && full ? { ...log, ...full } : log;
  const isPending = isReverting;
  const waitingDetail = !!log && isLoading && !full;

  return (
    <FormDialog
      open={!!log}
      onOpenChange={(open) => !open && !isPending && onClose()}
      width="md"
      title="Acciones del registro"
    >
      {merged && (
        <div className="space-y-4">
          <div className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Tabla:</span> {translateTable(merged.table_name)}</p>
            <p><span className="text-muted-foreground">Acción:</span> {translateAction(merged.action)}</p>
            <p><span className="text-muted-foreground">Fecha:</span> {formatTimestamp(merged.created_at)}</p>
            <p><span className="text-muted-foreground">Registro:</span> {getRecordLabel(merged)}</p>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <div className="relative">
              <Button
                variant="destructive"
                className="w-full justify-start"
                disabled={isPending || waitingDetail || isRevertDisabled(merged)}
                onClick={() => onRevert(merged)}
              >
                <UndoIcon className="h-4 w-4 mr-2" />
                {isReverting ? "Revirtiendo…" : "Revertir acción original"}
              </Button>
              {waitingDetail ? (
                <Skeleton className="h-3 w-2/3 mt-1.5" />
              ) : (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                  <WarnIcon className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                  {revertHint(merged)}
                </p>
              )}
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
