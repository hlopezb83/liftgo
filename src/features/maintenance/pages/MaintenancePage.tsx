import { useState } from "react";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { usePageActions } from "@/contexts/pageActions";
import { MarkAvailableDialog, useForkliftMap } from "@/features/fleet";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableFilters } from "@/hooks/filters/useTableFilters";

import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { MaintenanceDetailSheet } from "../components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFiltersBar } from "../components/maintenance/MaintenanceFiltersBar";
import { MaintenanceFormDialog } from "../components/maintenance/MaintenanceFormDialog";
import { MaintenanceKanban } from "../components/maintenance/MaintenanceKanban";
import { MaintenancePageActions } from "../components/maintenance/MaintenancePageActions";
import { MaintenanceMobileCard } from "../components/maintenance/MaintenanceRow";
import { useGenerateRecurringMaintenance } from "../hooks/maintenance/useGenerateRecurringMaintenance";
import { useMaintenanceForm } from "../hooks/maintenance/useMaintenanceForm";
import { useMaintenanceLogs, type MaintenanceLog } from "../hooks/maintenance/useMaintenanceLogs";
import { useActiveMechanics } from "../hooks/maintenance/useMechanics";
import { enrichLogs, maintenanceCsvRows, sumCost, type EnrichedMaintenanceLog } from "../lib/maintenancePageHelpers";

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

  const enrichedLogs = enrichLogs(logs, forkliftMap);

  const { search, setSearch, filtered: searchFiltered } = useListFilters(enrichedLogs, {
    searchFields: ["service_type", "performed_by", "description", "forklift_name"],
  });

  const filtered = (searchFiltered ?? []).filter((log) => forkliftFilter === "all" || log.forklift_id === forkliftFilter);

  const columns: ColumnDef<EnrichedMaintenanceLog>[] = [
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
  ];

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
