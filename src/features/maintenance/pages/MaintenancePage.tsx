import { useState } from "react";
import { useDialogState } from "@/hooks/useDialogState";
import { useForkliftMap } from "@/features/fleet/hooks/forklifts/useForkliftMap";
import { useMaintenanceLogs, type MaintenanceLog } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useGenerateRecurringMaintenance } from "@/features/maintenance/hooks/maintenance/useGenerateRecurringMaintenance";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { TableRow } from "@/components/ui/table";
import { MarkAvailableDialog } from "@/features/fleet/components/fleet/MarkAvailableDialog";
import { MaintenanceDetailSheet } from "@/features/maintenance/components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFormDialog } from "@/features/maintenance/components/maintenance/MaintenanceFormDialog";
import { MaintenanceFiltersBar } from "@/features/maintenance/components/maintenance/MaintenanceFiltersBar";
import { MaintenanceKanban } from "@/features/maintenance/components/maintenance/MaintenanceKanban";
import { MaintenanceTableRow, MaintenanceMobileCard } from "@/features/maintenance/components/maintenance/MaintenanceRow";
import { MaintenancePageActions } from "@/features/maintenance/components/maintenance/MaintenancePageActions";
import { useActiveMechanics } from "@/features/maintenance/hooks/maintenance/useMechanics";
import { useMaintenanceForm } from "@/features/maintenance/hooks/maintenance/useMaintenanceForm";
import { formatCurrency } from "@/lib/formatCurrency";
import { exportToCsv } from "@/lib/exportCsv";
import { enrichLogs, maintenanceSortAccessors, maintenanceCsvRows, sumCost, forkliftName } from "@/features/maintenance/lib/maintenancePageHelpers";

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const { data: activeMechanics } = useActiveMechanics();
  const generateRecurring = useGenerateRecurringMaintenance();
  const detail = useDialogState<MaintenanceLog>();
  const [forkliftFilter, setForkliftFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const formCtl = useMaintenanceForm(forkliftMap);

  const enrichedLogs = enrichLogs(logs, forkliftMap);

  const { search, setSearch, filtered: searchFiltered } = useListFilters(enrichedLogs, {
    searchFields: ["service_type", "performed_by", "description", "forklift_name"],
  });

  const filtered = (searchFiltered ?? []).filter(
    (log) => forkliftFilter === "all" || log.forklift_id === forkliftFilter,
  );

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: maintenanceSortAccessors(forkliftMap),
  });

  const isBoard = viewMode === "board";
  const kanbanContent = isBoard ? (
    <MaintenanceKanban logs={filtered} />
  ) : undefined;

  const mobileContent = isMobile && !isBoard ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(log) => log.id}
      emptyMessage="No se encontraron registros"
      renderCard={(log) => (
        <MaintenanceMobileCard log={log} forkliftMap={forkliftMap} onClick={() => detail.open(log)} />
      )}
    />
  ) : undefined;

  const totalCost = sumCost(logs);
  const exportCsv = () => exportToCsv("mantenimiento.csv", maintenanceCsvRows(logs, forkliftMap));

  return (
    <>
      <ListPageLayout
        title="Mantenimiento"
        subtitle={`${logs?.length || 0} registros de servicio — ${formatCurrency(totalCost)} costo total`}
        actions={
          <MaintenancePageActions
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExport={exportCsv}
            onGenerateRecurring={() => generateRecurring.mutate()}
            isGenerating={generateRecurring.isPending}
            onCreate={formCtl.openCreate}
          />
        }
        filters={
          <MaintenanceFiltersBar
            search={search}
            onSearchChange={setSearch}
            forkliftFilter={forkliftFilter}
            onForkliftFilterChange={setForkliftFilter}
            forklifts={forklifts}
          />
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No se encontraron registros de mantenimiento"
        tableHeader={
          <TableRow>
            <SortableTableHead sortKey="performed_at" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
            <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
            <SortableTableHead sortKey="service_type" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Tipo de Servicio</SortableTableHead>
            <SortableTableHead sortKey="performed_by" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Realizado Por</SortableTableHead>
            <SortableTableHead sortKey="cost" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort} className="text-right">Costo</SortableTableHead>
            <SortableTableHead sortKey="next_service_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Próximo Servicio</SortableTableHead>
          </TableRow>
        }
        renderRow={(log) => (
          <MaintenanceTableRow key={log.id} log={log} forkliftMap={forkliftMap} onClick={() => detail.open(log)} />
        )}
        customContent={kanbanContent || mobileContent}
      />

      <MaintenanceDetailSheet
        log={detail.selected}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
        forkliftName={detail.selected ? (forkliftMap.get(detail.selected.forklift_id)?.name || "—") : ""}
        onEdit={formCtl.openEdit}
      />

      <MaintenanceFormDialog
        open={formCtl.dialogOpen}
        onOpenChange={formCtl.setDialogOpen}
        isEdit={!!formCtl.editingLogId}
        isPending={formCtl.isPending}
        form={formCtl.form}
        set={formCtl.set}
        onSubmit={formCtl.handleSubmit}
        forklifts={forklifts}
        mechanics={activeMechanics}
      />

      {formCtl.availablePrompt && (
        <MarkAvailableDialog
          open={!!formCtl.availablePrompt}
          onOpenChange={(open) => { if (!open) formCtl.closeAvailablePrompt(); }}
          forkliftId={formCtl.availablePrompt.forkliftId}
          forkliftName={formCtl.availablePrompt.forkliftName}
        />
      )}
    </>
  );
}
