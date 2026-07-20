import { useMemo } from "react";
import type { ColumnDef } from "@/components/dataTable/v2";
import { DeleteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLog } from "../../hooks/useAuditLogs";
import {
  actionBadgeVariant,
  actionIcon,
  formatTimestamp,
  getRecordLabel,
  translateAction,
  translateField,
  translateTable,
} from "./auditTrailConstants";

export function useAuditTrailColumns(
  isAdmin: boolean,
  onDeleteRequest: (log: AuditLog) => void,
): ColumnDef<AuditLog>[] {
  return useMemo(() => {
    const base: ColumnDef<AuditLog>[] = [
      {
        id: "icon",
        header: "",
        enableSorting: false,
        meta: { cellClassName: "w-10" },
        cell: ({ row }) => actionIcon(row.original.action),
      },
      {
        id: "action",
        header: "Acción",
        accessorKey: "action",
        cell: ({ row }) => (
          <Badge variant={actionBadgeVariant(row.original.action)}>
            {translateAction(row.original.action)}
          </Badge>
        ),
      },
      {
        id: "table_name",
        header: "Tabla",
        accessorKey: "table_name",
        cell: ({ row }) => (
          <span className="text-sm">{translateTable(row.original.table_name)}</span>
        ),
      },
      {
        id: "record",
        header: "Registro",
        enableSorting: false,
        meta: { cellClassName: "text-sm font-medium max-w-[160px] truncate" },
        cell: ({ row }) => getRecordLabel(row.original),
      },
      {
        id: "fields",
        header: "Campos Modificados",
        enableSorting: false,
        meta: { cellClassName: "text-sm text-muted-foreground max-w-[200px] truncate" },
        cell: ({ row }) =>
          row.original.changed_fields?.map(translateField).join(", ") || "—",
      },
      {
        id: "user",
        header: "Usuario",
        accessorFn: (l) => l.user_email || "Sistema",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.user_email || "Sistema"}
          </span>
        ),
      },
      {
        id: "created_at",
        header: "Cuándo",
        accessorKey: "created_at",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatTimestamp(row.original.created_at)}
          </span>
        ),
      },
    ];
    if (isAdmin) {
      base.push({
        id: "delete",
        header: "",
        enableSorting: false,
        meta: { cellClassName: "w-10" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="iconSm"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(row.original);
            }}
          >
            <DeleteIcon />
          </Button>
        ),
      });
    }
    return base;
  }, [isAdmin, onDeleteRequest]);
}
