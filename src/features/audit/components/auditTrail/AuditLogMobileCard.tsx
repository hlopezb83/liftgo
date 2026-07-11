import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteIcon } from "@/components/icons";
import type { AuditLog } from "../../hooks/useAuditLogs";
import { actionIcon, actionBadgeVariant, translateAction, translateTable, translateField, formatTimestamp, getRecordLabel } from "./auditTrailConstants";

interface Props {
  log: AuditLog;
  isAdmin: boolean;
  onSelect: (log: AuditLog) => void;
  onDeleteRequest: (log: AuditLog) => void;
}

export function AuditLogMobileCard({ log, isAdmin, onSelect, onDeleteRequest }: Props) {
  return (
    <Card className="cursor-pointer" onClick={() => onSelect(log)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {actionIcon(log.action)}
            <Badge variant={actionBadgeVariant(log.action)}>{translateAction(log.action)}</Badge>
          </div>
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteRequest(log); }}>
              <DeleteIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-sm"><span className="text-muted-foreground">Tabla:</span> {translateTable(log.table_name)}</p>
        <p className="text-sm font-medium truncate">{getRecordLabel(log)}</p>
        {log.changed_fields && (
          <p className="text-xs text-muted-foreground truncate">{log.changed_fields.map(translateField).join(", ")}</p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>{log.user_email || "Sistema"}</span>
          <span>{formatTimestamp(log.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
