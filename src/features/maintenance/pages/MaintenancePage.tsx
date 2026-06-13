import { useState, useMemo } from "react";
import { useDialogState } from "@/hooks/useDialogState";
import { MarkAvailableDialog, useForkliftMap } from "@/features/fleet";
import { useMaintenanceLogs, type MaintenanceLog } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useGenerateRecurringMaintenance } from "@/features/maintenance/hooks/maintenance/useGenerateRecurringMaintenance";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { MaintenanceDetailSheet } from "@/features/maintenance/components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFormDialog } from "@/features/maintenance/components/maintenance/MaintenanceFormDialog";
import { MaintenanceFiltersBar } from "@/features/maintenance/components/maintenance/MaintenanceFiltersBar";
import { MaintenanceKanban } from "@/features/maintenance/components/maintenance/MaintenanceKanban";
import { MaintenanceMobileCard } from "@/features/maintenance/components/maintenance/MaintenanceRow";
import { MaintenancePageActions } from "@/features/maintenance/components/maintenance/MaintenancePageActions";
import { useActiveMechanics } from "@/features/maintenance/hooks/maintenance/useMechanics";
import { useMaintenanceForm } from "@/features/maintenance/hooks/maintenance/useMaintenanceForm";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { exportToCsv } from "@/lib/exportCsv";
import { formatDateDisplay } from "@/lib/utils";
import { enrichLogs, maintenanceCsvRows, sumCost, type EnrichedMaintenanceLog } from "@/features/maintenance/lib/maintenancePageHelpers";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { usePageActions } from "@/contexts/PageActionsContext";

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const { data: activeMechanics } = useActiveMechanics();
  const generateRecurring = useGenerateRecurringMaintenance();
  const detail = useDialogState<MaintenanceLog>();
  const [forkliftFilter, setForkliftFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const formCtl = useMaintenanceForm(forkliftMap);
  usePageActions({ onNew: formCtl.openCreate, newLabel: "Nuevo servicio" });

  const enrichedLogs = useMemo(() => enrichLogs(logs, forkliftMap), [logs, forkliftMap]);

  const { search, setSearch, filtered: searchFiltered } = useListFilters(enrichedLogs, {
    searchFields: ["service_type", "performed_by", "description", "forklift_name"],
  });

  const filtered = useMemo(
    () => (searchFiltered ?? []).filter((log) => forkliftFilter === "all" || log.forklift_id === forkliftFilter),
    [searchFiltered, forkliftFilter],
  );

  const columns = useMemo<ColumnDef<EnrichedMaintenanceLog>[]>(
    () => [
      {
        id: "performed_at",
        header: "Fecha",
        accessorKey: "performed_at",
        cell: ({ row }) => <span className="font-mono text-sm">{formatDateDisplay(row.original.performed_at)}</span>,
      },
      {
        id: "forklift_name",
        header: "Montacargas",
        accessorKey: "forklift_name",
        cell: ({ row }) => <span className="font-medium">{row.original.forklift_name || "—"}</span>,
      },
      {
        id: "service_type",
        header: "Tipo de Servicio",
        accessorKey: "service_type",
      },
      {
        id: "performed_by",
        header: "Realizado Por",
        accessorFn: (l) => l.performed_by ?? "",
        cell: ({ row }) => row.original.performed_by || "—",
      },
      {
        id: "cost",
        header: "Costo",
        accessorFn: (l) => l.cost ?? 0,
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.cost || 0)}</span>,
      },
      {
        id: "next_service_date",
        header: "Próximo Servicio",
        accessorFn: (l) => l.next_service_date ?? "",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.next_service_date)}</span>,
      },
    ],
    [],
  );

  const table = useLiftgoTable<EnrichedMaintenanceLog>({
    data: filtered,
    columns,
    getRowId: (l) => l.id,
  });

  const isBoard = viewMode === "board";
  const kanbanContent = isBoard ? <MaintenanceKanban logs={filtered} /> : undefined;

  const totalCost = sumCost(logs);
  const exportCsv = () => exportToCsv("mantenimiento.csv", maintenanceCsvRows(logs, forkliftMap));

  return (
    <>
      <ListPageLayout
        title="Mantenimiento"
        subtitle={`${logs?.length ?? 0} registros de servicio — ${formatCurrency(totalCost)} costo total`}
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
        table={isBoard ? undefined : table}
        onRowClick={(log) => detail.open(log)}
        emptyMessage="No se encontraron registros de mantenimiento"
        customContent={kanbanContent}
        mobileCardRender={(log) => (
          <MaintenanceMobileCard log={log} forkliftMap={forkliftMap} onClick={() => detail.open(log)} />
        )}
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
