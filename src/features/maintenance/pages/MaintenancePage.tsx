import { useState } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { MaintenanceIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { usePageActions } from "@/contexts/pageActions";
import { MarkAvailableDialog, useForkliftMap } from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useDialogState } from "@/hooks/useDialogState";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { visibleListRows } from "@/lib/supabase/constants";
import { MaintenanceDetailSheet } from "../components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFiltersBar } from "../components/maintenance/MaintenanceFiltersBar";
import { MaintenanceFormDialog } from "../components/maintenance/MaintenanceFormDialog";
import { MaintenanceGenerationResultDialog } from "../components/maintenance/MaintenanceGenerationResultDialog";
import { MaintenanceKanban } from "../components/maintenance/MaintenanceKanban";
import { MaintenancePageActions } from "../components/maintenance/MaintenancePageActions";
import { MaintenanceMobileCard } from "../components/maintenance/MaintenanceRow";
import { useGenerateRecurringMaintenance } from "../hooks/maintenance/useGenerateRecurringMaintenance";
import { useMaintenanceForm } from "../hooks/maintenance/useMaintenanceForm";
import { useMaintenanceLogs, type MaintenanceLog } from "../hooks/maintenance/useMaintenanceLogs";
import { useActiveMechanics } from "../hooks/maintenance/useMechanics";
import { enrichLogs, maintenanceCsvRows, sumCost, type EnrichedMaintenanceLog } from "../lib/maintenancePageHelpers";
import { maintenanceColumns } from "./maintenanceColumns";
import type { GenerateMaintenanceResponse } from "../lib/maintenanceGenerationFeedback";

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  // R5-A6: vista de archivados para restaurar OTs archivadas por error.
  const [showArchived, setShowArchived] = useState(false);
  const { data: logsRaw, isLoading, isError, refetch } = useMaintenanceLogs(undefined, showArchived);
  const logs = visibleListRows(logsRaw);
  const { data: activeMechanics } = useActiveMechanics();
  const [generationResult, setGenerationResult] = useState<GenerateMaintenanceResponse | null>(null);
  const generateRecurring = useGenerateRecurringMaintenance(setGenerationResult);
  const detail = useDialogState<MaintenanceLog>();
  const selectedLog = detail.selected ? logs?.find((log) => log.id === detail.selected?.id) ?? null : null;
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  const formCtl = useMaintenanceForm(forkliftMap);
  const canWrite = useHasModuleAccess("Mantenimiento", "full");
  usePageActions({
    onNew: canWrite ? formCtl.openCreate : undefined,
    newLabel: canWrite ? "Nuevo servicio" : undefined,
  });

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
  const kanbanContent = isBoard ? <MaintenanceKanban logs={filtered} archived={showArchived} canWrite={canWrite} /> : undefined;

  const totalCost = sumCost(filtered);
  const exportCsv = () => exportToCsv("mantenimiento.csv", maintenanceCsvRows(filtered, forkliftMap));

  return (
    <>
      <ListPageLayout
        title="Mantenimiento"
        subtitle={`${filtered.length} registros de servicio — ${formatCurrency(totalCost)} costo total`}
        actions={
          <MaintenancePageActions
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onExport={exportCsv}
            onGenerateRecurring={() => generateRecurring.mutate()}
            isGenerating={generateRecurring.isPending}
            onCreate={formCtl.openCreate}
            canCreate={canWrite}
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
              archived={showArchived}
              onArchivedChange={setShowArchived}
            />
          </div>
        }

        isLoading={isLoading}
        isError={isError}
        onRetry={() => { void refetch(); }}
        onRefresh={refetch}
        table={table}
        onRowClick={(log) => detail.open(log)}
        hasActiveFilters={hasActive}
        onClearFilters={reset}
        emptyMessage="No se encontraron registros de mantenimiento"
        emptyIcon={MaintenanceIcon}
        emptyActionLabel={canWrite ? "Nuevo servicio" : undefined}
        onEmptyAction={canWrite ? formCtl.openCreate : undefined}
        customContent={kanbanContent}
        mobileCardRender={(log) => (
          <MaintenanceMobileCard log={log} forkliftMap={forkliftMap} onClick={() => detail.open(log)} />
        )}
      />

      <MaintenanceDetailSheet
        log={selectedLog}
        open={detail.isOpen}
        onOpenChange={detail.onOpenChange}
        forkliftName={selectedLog ? (forkliftMap.get(selectedLog.forklift_id)?.name || "—") : ""}
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

      <MaintenanceGenerationResultDialog result={generationResult} onClose={() => setGenerationResult(null)} />

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
