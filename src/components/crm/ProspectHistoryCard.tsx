import { useState } from "react";
import { History, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLogs, type AuditLog } from "@/hooks/useAuditLogs";
import { AuditLogDetailDialog } from "@/components/auditTrail/AuditLogDetailDialog";
import {
  translateAction,
  translateField,
  formatTimestamp,
  formatAuditValue,
  HIDDEN_DIFF_FIELDS,
} from "@/components/auditTrail/auditTrailConstants";

interface Props {
  prospectId: string;
}

function summarizeChanges(log: AuditLog): string[] {
  if (log.action === "INSERT") return ["Prospecto creado"];
  if (log.action === "DELETE") return ["Prospecto eliminado"];
  const fields = (log.changed_fields || []).filter((f) => !HIDDEN_DIFF_FIELDS.has(f));
  if (fields.length === 0) return ["Sin cambios detectables"];
  return fields.map(
    (f) => `${translateField(f)}: ${formatAuditValue(f, log.old_data?.[f])} → ${formatAuditValue(f, log.new_data?.[f])}`
  );
}

export function ProspectHistoryCard({ prospectId }: Props) {
  const { data: logs = [], isLoading } = useAuditLogs({ table_name: "prospects", record_id: prospectId });
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const visible = expanded ? logs : logs.slice(0, 5);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
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
                            {formatTimestamp(log.created_at)}
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
                        <Eye className="h-3.5 w-3.5" />
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
