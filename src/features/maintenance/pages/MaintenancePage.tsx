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
import { Button } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { MarkAvailableDialog } from "@/features/fleet/components/fleet/MarkAvailableDialog";
import { RoleGuard } from "@/components/RoleGuard";
import { MaintenanceDetailSheet } from "@/features/maintenance/components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFormDialog } from "@/features/maintenance/components/maintenance/MaintenanceFormDialog";
import { MaintenanceFiltersBar } from "@/features/maintenance/components/maintenance/MaintenanceFiltersBar";
import { MaintenanceKanban } from "@/features/maintenance/components/maintenance/MaintenanceKanban";
import { MaintenanceTableRow, MaintenanceMobileCard } from "@/features/maintenance/components/maintenance/MaintenanceRow";
import { useActiveMechanics } from "@/features/maintenance/hooks/maintenance/useMechanics";
import { useMaintenanceForm } from "@/features/maintenance/hooks/maintenance/useMaintenanceForm";
import { formatCurrency } from "@/lib/formatCurrency";
import { exportToCsv } from "@/lib/exportCsv";
import { PlusCircle, Download, List, LayoutGrid, RefreshCw } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const { data: activeMechanics } = useActiveMechanics();
  const generateRecurring = useGenerateRecurringMaintenance();
  const detail = useDialogState<MaintenanceLog>();
  const [forkliftFilter, setForkliftFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const formCtl = useMaintenanceForm(forkliftMap);

  const enrichedLogs = logs?.map((log) => ({
    ...log,
    forklift_name: forkliftMap.get(log.forklift_id)?.name || "",
  }));

  const { search, setSearch, filtered: searchFiltered } = useListFilters(enrichedLogs, {
    searchFields: ["service_type", "performed_by", "description", "forklift_name"],
  });

  const filtered = searchFiltered?.filter((log) =>
    forkliftFilter === "all" || log.forklift_id === forkliftFilter
  );

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: {
      performed_at: (l) => l.performed_at,
      forklift_name: (l) => forkliftMap.get(l.forklift_id)?.name || "",
      service_type: (l) => l.service_type,
      performed_by: (l) => l.performed_by || "",
      cost: (l) => l.cost || 0,
      next_service_date: (l) => l.next_service_date || "",
    },
  });

  const kanbanContent = viewMode === "board" ? (
    <MaintenanceKanban logs={filtered?.map(l => ({ ...l, forklift_name: forkliftMap.get(l.forklift_id)?.name || "" })) || []} />
  ) : undefined;

  const mobileContent = isMobile && viewMode === "list" ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(log) => log.id}
      emptyMessage="No se encontraron registros"
      renderCard={(log) => (
        <MaintenanceMobileCard log={log} forkliftMap={forkliftMap} onClick={() => detail.open(log)} />
      )}
    />
  ) : undefined;

  const totalCost = logs?.reduce((sum, l) => sum + (l.cost || 0), 0) || 0;

  const exportCsv = () => exportToCsv("mantenimiento.csv", (logs || []).map(l => ({
    Fecha: l.performed_at,
    Montacargas: forkliftMap.get(l.forklift_id)?.name || "",
    Servicio: l.service_type,
    "Realizado Por": l.performed_by || "",
    Costo: l.cost || 0,
    "Próximo Servicio": l.next_service_date || "",
  })));

  return (
    <>
      <ListPageLayout
        title="Mantenimiento"
        subtitle={`${logs?.length || 0} registros de servicio — ${formatCurrency(totalCost)} costo total`}
        actions={
          <div className="flex gap-2 items-center">
            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "list" | "board")} size="sm">
              <ToggleGroupItem value="list" aria-label="Vista de lista"><List className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="board" aria-label="Vista de tablero"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" />Exportar CSV
            </Button>
            <RoleGuard module="Mantenimiento" minAccess="full">
              <Button variant="outline" size="sm" onClick={() => generateRecurring.mutate()} disabled={generateRecurring.isPending}>
                <RefreshCw className={`h-4 w-4 mr-1 ${generateRecurring.isPending ? "animate-spin" : ""}`} />
                Generar Recurrente
              </Button>
            </RoleGuard>
            <Button onClick={formCtl.openCreate} size="sm">
              <PlusCircle className="h-4 w-4 mr-1" /> Registrar Servicio
            </Button>
          </div>
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
