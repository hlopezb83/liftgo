import { useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { DeleteIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { AuditLogDetailDialog } from "../components/auditTrail/AuditLogDetailDialog";
import { AuditLogMobileCard } from "../components/auditTrail/AuditLogMobileCard";
import {
  TABLES, getRecordLabel, actionIcon, actionBadgeVariant,
  translateAction, translateTable, translateField, formatTimestamp,
} from "../components/auditTrail/auditTrailConstants";
import { DeleteAuditLogDialog } from "../components/auditTrail/DeleteAuditLogDialog";
import { useAuditLogs, useDeleteAuditLog, useRevertAuditLog } from "../hooks/useAuditLogs";
import type { AuditLog } from "../hooks/useAuditLogs";

export default function AuditTrailPage() {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [logToDelete, setLogToDelete] = useState<AuditLog | null>(null);

  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  const { mutate: deleteAuditLog, isPending: isDeleting } = useDeleteAuditLog();
  const { mutate: revertAuditLog, isPending: isReverting } = useRevertAuditLog();

  const tableOptions = TABLES.map((t) => t.value).filter((v) => v !== "all") as string[];

  // El filtro por tabla es server-side (afecta la query) → lo leemos del URL
  // vía useTableFilters y lo pasamos como argumento al hook.
  const { values, set, reset, hasActive } = useTableFilters<AuditLog, {
    q: { type: "text" };
    table_name: { type: "enum"; options: string[]; ui: "select" };
  }>({
    facets: {
      q: { type: "text" },
      table_name: { type: "enum", options: tableOptions, ui: "select" },
    },
  });

  const { data: logs, isLoading } = useAuditLogs(
    values.table_name !== "all" ? { table_name: values.table_name } : undefined,
  );

  // Búsqueda cliente sobre los logs ya filtrados por tabla en el servidor.
  const search = values.q.toLowerCase();
  const displayed = !search
    ? (logs ?? [])
    : (logs ?? []).filter((log) =>
        [log.table_name, log.action, log.user_email ?? "", getRecordLabel(log)]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );




  const columns: ColumnDef<AuditLog>[] = (() => {
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
        cell: ({ row }) => <Badge variant={actionBadgeVariant(row.original.action)}>{translateAction(row.original.action)}</Badge>,
      },
      {
        id: "table_name",
        header: "Tabla",
        accessorKey: "table_name",
        cell: ({ row }) => <span className="text-sm">{translateTable(row.original.table_name)}</span>,
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
        cell: ({ row }) => row.original.changed_fields?.map(translateField).join(", ") || "—",
      },
      {
        id: "user",
        header: "Usuario",
        accessorFn: (l) => l.user_email || "Sistema",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.user_email || "Sistema"}</span>,
      },
      {
        id: "created_at",
        header: "Cuándo",
        accessorKey: "created_at",
        cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatTimestamp(row.original.created_at)}</span>,
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
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); setLogToDelete(row.original); }}
          >
            <DeleteIcon className="h-4 w-4" />
          </Button>
        ),
      });
    }
    return base;
  })();

  const table = useLiftgoTable<AuditLog>({
    data: displayed,
    columns,
    getRowId: (l) => l.id,
  });

  const tableLabelMap = new Map(TABLES.map((t) => [t.value, t.label]));

  return (
    <>
      <ListPageLayout
        title="Bitácora de Cambios"
        subtitle="Rastrea todos los cambios en el sistema"
        filters={
          <FiltersToolbar>
            <FiltersToolbar.Search
              value={values.q}
              onChange={(v) => set("q", v)}
              placeholder="Buscar en bitácora…"
            />
            <FiltersToolbar.StatusSelect
              value={values.table_name}
              onChange={(v) => set("table_name", v)}
              options={TABLES.map((t) => ({
                value: t.value,
                label: tableLabelMap.get(t.value) ?? t.label,
              }))}
              placeholder="Tabla"
            />
            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        }
        isLoading={isLoading}
        table={table}
        onRowClick={(log) => setSelectedLog(log)}
        emptyMessage="No se encontraron registros"
        mobileCardRender={(log) => (
          <AuditLogMobileCard
            log={log}
            isAdmin={isAdmin}
            onSelect={setSelectedLog}
            onDeleteRequest={setLogToDelete}
          />
        )}
      />

      <AuditLogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />

      <DeleteAuditLogDialog
        log={logToDelete}
        isDeleting={isDeleting}
        isReverting={isReverting}
        onClose={() => setLogToDelete(null)}
        onDelete={(log) => deleteAuditLog(log.id, { onSettled: () => setLogToDelete(null) })}
        onRevert={(log) => revertAuditLog(
          { id: log.id, tableName: log.table_name },
          { onSettled: () => setLogToDelete(null) },
        )}
      />
    </>
  );
}
