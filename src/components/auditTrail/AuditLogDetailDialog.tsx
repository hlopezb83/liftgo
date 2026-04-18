import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import type { AuditLog } from "@/hooks/useAuditLogs";
import { actionIcon, translateAction, translateTable, translateField, formatTimestamp } from "./auditTrailConstants";

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
                <div><span className="text-muted-foreground block">Campos Modificados</span>{log.changed_fields.map(translateField).join(", ")}</div>
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
                    {log.changed_fields.map((field) => (
                      <TableRow key={field}>
                        <TableCell className="font-medium text-sm">{translateField(field)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono max-w-[200px] truncate">
                          {JSON.stringify(log.old_data?.[field]) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono max-w-[200px] truncate">
                          {JSON.stringify(log.new_data?.[field]) ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {log.action === "INSERT" && log.new_data && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Datos Creados</h4>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                  {JSON.stringify(log.new_data, null, 2)}
                </pre>
              </div>
            )}

            {log.action === "DELETE" && log.old_data && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Datos Eliminados</h4>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-60">
                  {JSON.stringify(log.old_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
