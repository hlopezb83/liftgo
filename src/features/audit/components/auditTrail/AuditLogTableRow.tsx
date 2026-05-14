import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import { actionIcon, actionBadgeVariant, translateAction, translateTable, translateField, formatTimestamp, getRecordLabel } from "./auditTrailConstants";

interface Props {
  log: AuditLog;
  isAdmin: boolean;
  onSelect: (log: AuditLog) => void;
  onDeleteRequest: (log: AuditLog) => void;
}

export function AuditLogTableRow({ log, isAdmin, onSelect, onDeleteRequest }: Props) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors" onClick={() => onSelect(log)}>
      <TableCell>{actionIcon(log.action)}</TableCell>
      <TableCell><Badge variant={actionBadgeVariant(log.action)}>{translateAction(log.action)}</Badge></TableCell>
      <TableCell className="text-sm">{translateTable(log.table_name)}</TableCell>
      <TableCell className="text-sm font-medium max-w-[160px] truncate">{getRecordLabel(log)}</TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{log.changed_fields?.map(translateField).join(", ") || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{log.user_email || "Sistema"}</TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatTimestamp(log.created_at)}</TableCell>
      {isAdmin && (
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDeleteRequest(log); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
