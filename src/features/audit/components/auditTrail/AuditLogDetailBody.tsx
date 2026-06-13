import {
  translateField,
  formatTimestamp,
} from "./auditTrailConstants";
import { AuditSnapshotTable, AuditUpdateDiffTable } from "./AuditDiffTables";
import { visibleFields } from "./auditDiffHelpers";
import type { AuditLog } from "../../hooks/useAuditLogs";

function renderDataBlock(log: AuditLog) {
  const oldData = (log.old_data as Record<string, unknown> | null) ?? {};
  const newData = (log.new_data as Record<string, unknown> | null) ?? {};
  if (log.action === "UPDATE" && log.changed_fields) {
    return (
      <AuditUpdateDiffTable
        changedFields={log.changed_fields}
        oldData={oldData}
        newData={newData}
      />
    );
  }
  if (log.action === "INSERT") {
    return <AuditSnapshotTable title="Datos Creados" data={newData} />;
  }
  if (log.action === "DELETE") {
    return <AuditSnapshotTable title="Datos Eliminados" data={oldData} />;
  }
  return null;
}

export function AuditLogDetailBody({ log }: { log: AuditLog }) {
  const fieldsLabel = log.changed_fields
    ? (visibleFields(log.changed_fields).map(translateField).join(", ") || "—")
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground block">ID del Registro</span>
          <span className="font-mono text-xs">{log.record_id}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Usuario</span>
          {log.user_email || "Sistema"}
        </div>
        <div>
          <span className="text-muted-foreground block">Fecha y Hora</span>
          {formatTimestamp(log.created_at)}
        </div>
        {fieldsLabel !== null && (
          <div>
            <span className="text-muted-foreground block">Campos Modificados</span>
            {fieldsLabel}
          </div>
        )}
      </div>
      {renderDataBlock(log)}
    </div>
  );
}
