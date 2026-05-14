import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import {
  actionIcon,
  translateAction,
  translateTable,
  translateField,
  formatTimestamp,
  formatAuditValue,
  HIDDEN_DIFF_FIELDS,
} from "./auditTrailConstants";

interface Props {
  log: AuditLog | null;
  onClose: () => void;
}

function visibleFields(fields: string[] | null | undefined): string[] {
  return (fields ?? []).filter((f) => !HIDDEN_DIFF_FIELDS.has(f));
}

function visibleSnapshot(data: Record<string, unknown> | null | undefined): [string, unknown][] {
  if (!data) return [];
  return Object.entries(data)
    .filter(([k, v]) => !HIDDEN_DIFF_FIELDS.has(k) && v !== null && v !== "")
    .sort(([a], [b]) => translateField(a).localeCompare(translateField(b)));
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
              <div>
                <h4 className="text-sm font-semibold mb-2">Cambios en Campos</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      <TableHead>Valor Anterior</TableHead>
                      <TableHead>Valor Nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleFields(log.changed_fields).map((field) => (
                      <TableRow key={field}>
                        <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
                        <TableCell className="text-sm text-destructive line-through max-w-[220px] truncate">
                          {formatAuditValue(field, log.old_data?.[field])}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-emerald-600 max-w-[220px] truncate">
                          {formatAuditValue(field, log.new_data?.[field])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {(log.action === "INSERT" || log.action === "DELETE") && (log.new_data || log.old_data) && (
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  {log.action === "INSERT" ? "Datos Creados" : "Datos Eliminados"}
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSnapshot((log.action === "INSERT" ? log.new_data : log.old_data) as Record<string, unknown>).map(
                      ([field, value]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
                          <TableCell className="text-sm max-w-[400px] truncate">
                            {formatAuditValue(field, value)}
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Ver JSON completo
                  </summary>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60 mt-2">
                    {JSON.stringify(log.action === "INSERT" ? log.new_data : log.old_data, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
