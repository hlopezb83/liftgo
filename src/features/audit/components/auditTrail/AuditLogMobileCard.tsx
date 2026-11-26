import { UndoIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { actionIcon, actionBadgeVariant, translateAction, translateTable, translateField, formatTimestamp, getRecordLabel } from "./auditTrailConstants";
import type { AuditLog } from "../../hooks/useAuditLogs";

interface Props {
  log: AuditLog;
  isAdmin: boolean;
  onSelect: (log: AuditLog) => void;
  onDeleteRequest: (log: AuditLog) => void;
}

export function AuditLogMobileCard({ log, isAdmin, onSelect, onDeleteRequest }: Props) {
  const recordLabel = getRecordLabel(log);
  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {actionIcon(log.action)}
            <Badge variant={actionBadgeVariant(log.action)}>{translateAction(log.action)}</Badge>
          </div>
          {isAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Revertir acción en ${recordLabel}`}
              title="Revertir acción"
              onClick={() => onDeleteRequest(log)}
            >
              <UndoIcon />
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect(log)}
          className="block w-full rounded-sm text-left space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <p className="text-sm"><span className="text-muted-foreground">Tabla:</span> {translateTable(log.table_name)}</p>
          <p className="text-sm font-medium truncate">{recordLabel}</p>
          {log.changed_fields && (
            <p className="text-xs text-muted-foreground truncate">{log.changed_fields.map(translateField).join(", ")}</p>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
            <span className="min-w-0 truncate">{log.user_email || "Sistema"}</span>
            <span className="shrink-0 tabular-nums">{formatTimestamp(log.created_at)}</span>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}
