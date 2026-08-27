import { useCallback, useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { visibleListRows } from "@/lib/supabase/constants";
import { AuditLogDetailDialog } from "../components/auditTrail/AuditLogDetailDialog";
import { AuditLogMobileCard } from "../components/auditTrail/AuditLogMobileCard";
import { TABLES, getRecordLabel } from "../components/auditTrail/auditTrailConstants";
import { DeleteAuditLogDialog } from "../components/auditTrail/DeleteAuditLogDialog";
import { useAuditTrailColumns } from "../components/auditTrail/useAuditTrailColumns";
import { useAuditLogs, usePurgeE2eAuditLogs, useRevertAuditLog } from "../hooks/useAuditLogs";
import type { AuditLog, AuditOrigin } from "../hooks/useAuditLogs";

// v7.364.0: los rastros de las pruebas automatizadas se ocultan por defecto.
const ORIGIN_OPTIONS: { value: AuditOrigin; label: string }[] = [
  { value: "default", label: "Usuarios y sistema" },
  { value: "user", label: "Solo usuarios" },
  { value: "system", label: "Solo sistema" },
  { value: "e2e", label: "Solo pruebas" },
  { value: "all", label: "Todos los orígenes" },
];

export default function AuditTrailPage() {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [logToDelete, setLogToDelete] = useState<AuditLog | null>(null);

  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  const { mutate: revertAuditLog, isPending: isReverting } = useRevertAuditLog();
  const { mutate: purgeE2eLogs, isPending: isPurging } = usePurgeE2eAuditLogs();

  const tableOptions = TABLES.map((t) => t.value).filter((v) => v !== "all") as string[];

  const { values, set, reset, hasActive } = useTableFilters<AuditLog, {
    q: { type: "text" };
    table_name: { type: "enum"; options: string[]; ui: "select" };
    origin: { type: "enum"; options: string[]; ui: "select" };
  }>({
    facets: {
      q: { type: "text" },
      table_name: { type: "enum", options: tableOptions, ui: "select" },
      origin: { type: "enum", options: ORIGIN_OPTIONS.map((o) => o.value), ui: "select" },
    },
  });

  const origin: AuditOrigin = values.origin === "all"
    ? "all"
    : ORIGIN_OPTIONS.some((o) => o.value === values.origin)
      ? (values.origin as AuditOrigin)
      : "default";

  const { data: logs, isLoading, isError, refetch } = useAuditLogs({
    ...(values.table_name !== "all" ? { table_name: values.table_name } : {}),
    origin,
  });

  const search = values.q.toLowerCase();
  // N3-01: recortar la fila extra del limit+1 antes de renderizar/buscar;
  // el crudo (`logs`) queda solo para ListTruncationNotice.
  const visibleLogs = visibleListRows(logs);
  const displayed = !search
    ? visibleLogs
    : visibleLogs.filter((log) =>
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
        notice={
          <ListTruncationNotice rows={logs} />
        }
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
            <FiltersToolbar.StatusSelect
              value={origin}
              onChange={(v) => set("origin", v)}
              options={ORIGIN_OPTIONS}
              placeholder="Origen"
            />
            {isAdmin && origin === "e2e" && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPurging}
                onClick={() => purgeE2eLogs()}
              >
                Eliminar registros de prueba
              </Button>
            )}
            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        }

        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        table={table}
        onRowClick={(log) => setSelectedLog(log)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
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
        isReverting={isReverting}
        onClose={() => setLogToDelete(null)}
        onRevert={(log) => revertAuditLog(
          { id: log.id, tableName: log.table_name },
          { onSettled: () => setLogToDelete(null) },
        )}
      />
    </>
  );
}
