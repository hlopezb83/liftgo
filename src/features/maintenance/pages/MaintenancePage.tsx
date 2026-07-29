import { useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { MaintenanceIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { usePageActions } from "@/contexts/pageActions";
import { MarkAvailableDialog, useForkliftMap } from "@/features/fleet";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useDialogState } from "@/hooks/useDialogState";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { visibleListRows } from "@/lib/supabase/constants";
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
import { maintenanceColumns } from "./maintenanceColumns";

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  const { data: logsRaw, isLoading, isError, refetch } = useMaintenanceLogs();
  const logs = visibleListRows(logsRaw);
  const { data: activeMechanics } = useActiveMechanics();
  const generateRecurring = useGenerateRecurringMaintenance();
  const detail = useDialogState<MaintenanceLog>();
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const formCtl = useMaintenanceForm(forkliftMap);
  usePageActions({ onNew: formCtl.openCreate, newLabel: "Nuevo servicio" });

  const enrichedLogs = enrichLogs(logs, forkliftMap);

  const {
    values,
    set,
    reset,
    hasActive,
    filtered,
  } = useTableFilters<EnrichedMaintenanceLog, {
    q: { type: "text"; fields: (keyof EnrichedMaintenanceLog)[] };
    forklift: { type: "entityRef"; field: keyof EnrichedMaintenanceLog };
  }>({
    items: enrichedLogs,
    facets: {
      q: {
        type: "text",
        fields: ["service_type", "performed_by", "description", "forklift_name"] as (keyof EnrichedMaintenanceLog)[],
      },
      forklift: { type: "entityRef", field: "forklift_id" },
    },
  });



  const table = useLiftgoTable<EnrichedMaintenanceLog>({
    data: filtered,
    columns: maintenanceColumns,
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
        notice={
          <ListTruncationNotice rows={logsRaw} />
        }
        filters={
          <div className="space-y-3">
            <MaintenanceFiltersBar
              search={values.q}
              onSearchChange={(v) => set("q", v)}
              forkliftFilter={values.forklift || "all"}
              onForkliftFilterChange={(v) => set("forklift", v)}
              forklifts={forklifts}
              hasActive={hasActive}
              onClear={reset}
            />
          </div>
        }

        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        onRefresh={refetch}
        table={isBoard ? undefined : table}
        onRowClick={(log) => detail.open(log)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyMessage="No se encontraron registros de mantenimiento"
        emptyIcon={MaintenanceIcon}
        emptyActionLabel="Nuevo servicio"
        onEmptyAction={formCtl.openCreate}
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
