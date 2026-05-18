import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import {
  actionIcon,
  translateAction,
  translateTable,
  translateField,
  formatTimestamp,
} from "./auditTrailConstants";
import {
  AuditSnapshotTable,
  AuditUpdateDiffTable,
  visibleFields,
} from "./AuditDiffTables";

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

export function AuditLogDetailDialog({ log, onClose }: Props) {
  return (
    <Dialog open={!!log} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {log && actionIcon(log.action)}
            {log && translateAction(log.action)} — {log && translateTable(log.table_name)}
          </DialogTitle>
        </DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground block">ID del Registro</span><span className="font-mono text-xs">{log.record_id}</span></div>
              <div><span className="text-muted-foreground block">Usuario</span>{log.user_email || "Sistema"}</div>
              <div><span className="text-muted-foreground block">Fecha y Hora</span>{formatTimestamp(log.created_at)}</div>
              {log.changed_fields && (
                <div>
                  <span className="text-muted-foreground block">Campos Modificados</span>
                  {visibleFields(log.changed_fields).map(translateField).join(", ") || "—"}
                </div>
              )}
            </div>

            {log.action === "UPDATE" && log.changed_fields && log.old_data && log.new_data && (
              <AuditUpdateDiffTable
                changedFields={log.changed_fields}
                oldData={log.old_data as Record<string, unknown>}
                newData={log.new_data as Record<string, unknown>}
              />
            )}

            {log.action === "INSERT" && log.new_data && (
              <AuditSnapshotTable title="Datos Creados" data={log.new_data as Record<string, unknown>} />
            )}
            {log.action === "DELETE" && log.old_data && (
              <AuditSnapshotTable title="Datos Eliminados" data={log.old_data as Record<string, unknown>} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
