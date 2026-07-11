import { useState, useMemo } from "react";
import { useAuditLogs, useDeleteAuditLog, useRevertAuditLog } from "../hooks/useAuditLogs";
import { useUserRole } from "@/features/users";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { SearchBar } from "@/components/forms/SearchBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteIcon } from "@/components/icons";
import type { AuditLog } from "../hooks/useAuditLogs";
import {
  TABLES, getRecordLabel, actionIcon, actionBadgeVariant,
  translateAction, translateTable, translateField, formatTimestamp,
} from "../components/auditTrail/auditTrailConstants";
import { AuditLogDetailDialog } from "../components/auditTrail/AuditLogDetailDialog";
import { DeleteAuditLogDialog } from "../components/auditTrail/DeleteAuditLogDialog";
import { AuditLogMobileCard } from "../components/auditTrail/AuditLogMobileCard";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

export default function AuditTrailPage() {
  const [tableFilter, setTableFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [logToDelete, setLogToDelete] = useState<AuditLog | null>(null);

  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  const { mutate: deleteAuditLog, isPending: isDeleting } = useDeleteAuditLog();
  const { mutate: revertAuditLog, isPending: isReverting } = useRevertAuditLog();

  const { data: logs, isLoading } = useAuditLogs(
    tableFilter !== "all" ? { table_name: tableFilter } : undefined,
  );

  const filtered = useMemo(
    () =>
      (logs ?? []).filter((log) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          log.table_name.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          (log.user_email || "").toLowerCase().includes(q) ||
          getRecordLabel(log).toLowerCase().includes(q)
        );
      }),
    [logs, search],
  );

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => {
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
    },
    [isAdmin],
  );

  const table = useLiftgoTable<AuditLog>({
    data: filtered,
    columns,
    getRowId: (l) => l.id,
  });

  return (
    <>
      <ListPageLayout
        title="Bitácora de Cambios"
        subtitle="Rastrea todos los cambios en el sistema"
        filters={
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar en bitácora…" className="w-full sm:w-64" />
          </div>
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
