import { useMemo } from "react";
import type { ColumnDef } from "@/components/dataTable/v2";
import { UndoIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  actionBadgeVariant,
  actionIcon,
  formatTimestamp,
  getRecordLabel,
  translateAction,
  translateField,
  translateTable,
} from "./auditTrailConstants";
import type { AuditLog } from "../../hooks/useAuditLogs";

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
        cell: ({ row }) => {
          const email = row.original.user_email;
          return (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {email || "Sistema"}
              {/* v7.364.0: distinguir movimientos automáticos y rastros de pruebas.
                  Hallazgo 8: si no hay email, el texto ya dice "Sistema" — el
                  badge duplicado ("Sistema Sistema") sólo se muestra cuando hay
                  un correo que acompañar. */}
              {row.original.is_e2e ? (
                <Badge variant="outline">Prueba</Badge>
              ) : email && row.original.source === "system" ? (
                <Badge variant="secondary">Sistema</Badge>
              ) : null}
            </span>
          );
        },
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
        // R15 AUTH-3: la acción abre "Revertir", no eliminar. Ícono Undo,
        // sin destructive coloring.
        id: "revert",
        header: "",
        enableSorting: false,
        meta: { cellClassName: "w-10" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="iconSm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Revertir acción"
            title="Revertir acción"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(row.original);
            }}
          >
            <UndoIcon />
          </Button>
        ),
      });
    }
    return base;
  }, [isAdmin, onDeleteRequest]);
}
