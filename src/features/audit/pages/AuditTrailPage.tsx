import { useState } from "react";
import { useAuditLogs, useDeleteAuditLog, useRevertAuditLog } from "@/features/audit/hooks/useAuditLogs";
import { useUserRole } from "@/hooks/useUserRole";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SearchBar } from "@/components/SearchBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow, TableHead } from "@/components/ui/table";
import type { AuditLog } from "@/features/audit/hooks/useAuditLogs";
import { TABLES, getRecordLabel } from "@/features/audit/components/auditTrail/auditTrailConstants";
import { AuditLogDetailDialog } from "@/features/audit/components/auditTrail/AuditLogDetailDialog";
import { DeleteAuditLogDialog } from "@/features/audit/components/auditTrail/DeleteAuditLogDialog";
import { AuditLogMobileCard } from "@/features/audit/components/auditTrail/AuditLogMobileCard";
import { AuditLogTableRow } from "@/features/audit/components/auditTrail/AuditLogTableRow";

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
    tableFilter !== "all" ? { table_name: tableFilter } : undefined
  );

  const filtered = logs?.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.table_name.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.user_email || "").toLowerCase().includes(q) ||
      getRecordLabel(log).toLowerCase().includes(q)
    );
  });

  const { page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered);

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(log) => log.id}
      emptyMessage="No se encontraron registros"
      renderCard={(log) => (
        <AuditLogMobileCard
          log={log}
          isAdmin={isAdmin}
          onSelect={setSelectedLog}
          onDeleteRequest={setLogToDelete}
        />
      )}
    />
  ) : undefined;

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
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron registros"
        customContent={mobileContent}
        tableHeader={
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Acción</TableHead>
            <TableHead>Tabla</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead>Campos Modificados</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Cuándo</TableHead>
            {isAdmin && <TableHead className="w-10" />}
          </TableRow>
        }
        renderRow={(log) => (
          <AuditLogTableRow
            key={log.id}
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
          { onSettled: () => setLogToDelete(null) }
        )}
      />
    </>
  );
}
