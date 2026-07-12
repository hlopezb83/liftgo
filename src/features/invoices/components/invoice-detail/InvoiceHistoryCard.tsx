import { useState } from "react";
import { HistoryIcon, ViewIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogDetailDialog, translateAction, translateField, type AuditLog, useAuditLogs } from "@/features/audit";
import { formatDateTimeMty } from "@/lib/format/dateFormats";
interface Props {
  invoiceId: string;
}

const HIDDEN_LONG_FIELDS = new Set(["cfdi_xml", "line_items", "facturapi_invoice_id"]);

function summarizeChanges(log: AuditLog): string[] {
  if (log.action === "INSERT") return ["Factura creada"];
  if (log.action === "DELETE") return ["Factura eliminada"];
  const fields = log.changed_fields || [];
  if (fields.length === 0) return ["Sin cambios detectables"];
  return fields
    .filter((f) => f !== "updated_at")
    .map((f) => {
      if (HIDDEN_LONG_FIELDS.has(f)) return `${translateField(f)}: actualizado`;
      const oldV = log.old_data?.[f];
      const newV = log.new_data?.[f];
      const fmt = (v: unknown) => {
        if (v === null || v === undefined || v === "") return "—";
        if (typeof v === "object") return "(actualizado)";
        return String(v);
      };
      return `${translateField(f)}: ${fmt(oldV)} → ${fmt(newV)}`;
    });
}

export function InvoiceHistoryCard({ invoiceId }: Props) {
  const { data: logs = [], isLoading } = useAuditLogs({ table_name: "invoices", record_id: invoiceId });
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const visible = expanded ? logs : logs.slice(0, 5);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-muted-foreground" />
            Historial de Cambios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cambios registrados</p>
          ) : (
            <>
              <div className="space-y-3">
                {visible.map((log) => {
                  const changes = summarizeChanges(log);
                  return (
                    <div key={log.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{translateAction(log.action)}</span>
                          {log.user_email && (
                            <span className="text-xs text-muted-foreground">por {log.user_email}</span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                            {formatDateTimeMty(log.created_at)}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {changes.slice(0, 4).map((c, i) => (
                            <li key={i} className="truncate">{c}</li>
                          ))}
                          {changes.length > 4 && (
                            <li className="italic">+{changes.length - 4} más…</li>
                          )}
                        </ul>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setSelected(log)}
                        aria-label="Ver detalle"
                      >
                        <ViewIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {logs.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "Ver menos" : `Ver ${logs.length - 5} más`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AuditLogDetailDialog log={selected} onClose={() => setSelected(null)} />
    </>
  );
}
