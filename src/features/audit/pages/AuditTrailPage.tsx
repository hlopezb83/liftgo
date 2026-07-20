import { useCallback, useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useUserRole } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { AuditLogDetailDialog } from "../components/auditTrail/AuditLogDetailDialog";
import { AuditLogMobileCard } from "../components/auditTrail/AuditLogMobileCard";
import { TABLES, getRecordLabel } from "../components/auditTrail/auditTrailConstants";
import { DeleteAuditLogDialog } from "../components/auditTrail/DeleteAuditLogDialog";
import { useAuditTrailColumns } from "../components/auditTrail/useAuditTrailColumns";
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

  const search = values.q.toLowerCase();
  const displayed = !search
    ? (logs ?? [])
    : (logs ?? []).filter((log) =>
        [log.table_name, log.action, log.user_email ?? "", getRecordLabel(log)]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );

  const onDeleteRequest = useCallback((log: AuditLog) => setLogToDelete(log), []);
  const columns = useAuditTrailColumns(isAdmin, onDeleteRequest);

  const table = useLiftgoTable<AuditLog>({
    data: displayed,
    columns,
    getRowId: (l) => l.id,
  });


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
              options={TABLES.map((t) => ({ value: t.value, label: t.label }))}
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
