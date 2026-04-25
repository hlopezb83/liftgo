import { useState } from "react";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useMaintenanceLogs, useCreateMaintenanceLog, useUpdateMaintenanceLog, type MaintenanceLog } from "@/hooks/useMaintenanceLogs";
import { useGenerateRecurringMaintenance } from "@/hooks/useGenerateRecurringMaintenance";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { MarkAvailableDialog } from "@/components/fleet/MarkAvailableDialog";
import { RoleGuard } from "@/components/RoleGuard";
import { MaintenanceDetailSheet } from "@/components/maintenance/MaintenanceDetailSheet";
import { MaintenanceFormDialog, type MaintenanceFormShape } from "@/components/maintenance/MaintenanceFormDialog";
import { MaintenanceFiltersBar } from "@/components/maintenance/MaintenanceFiltersBar";
import { useFormState } from "@/hooks/useFormState";
import { useActiveMechanics } from "@/hooks/useMechanics";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, Download, List, LayoutGrid, RefreshCw } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MaintenanceKanban } from "@/components/maintenance/MaintenanceKanban";
import { exportToCsv } from "@/lib/exportCsv";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { formatDateDisplay } from "@/lib/utils";

const initialForm: MaintenanceFormShape = {
  forkliftId: "", serviceType: "", description: "", cost: "",
  performedBy: "", performedAt: new Date(), nextServiceDate: undefined, supplierId: "",
};

export default function MaintenancePage() {
  const { forkliftMap, forklifts } = useForkliftMap();
  const { data: logs, isLoading } = useMaintenanceLogs();
  const { data: activeMechanics } = useActiveMechanics();
  const createLog = useCreateMaintenanceLog();
  const updateLog = useUpdateMaintenanceLog();
  const generateRecurring = useGenerateRecurringMaintenance();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<MaintenanceLog | null>(null);
  const { form, set, reset } = useFormState(initialForm);
  const [forkliftFilter, setForkliftFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [availablePrompt, setAvailablePrompt] = useState<{ forkliftId: string; forkliftName: string } | null>(null);

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
        <Card className="cursor-pointer" onClick={() => setSelectedLog(log)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{log.service_type}</span>
              <span className="text-sm font-mono font-medium">{formatCurrency(log.cost || 0)}</span>
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatDateDisplay(log.performed_at)}</span>
              {log.performed_by && <span>por {log.performed_by}</span>}
            </div>
            {log.next_service_date && <p className="text-xs text-muted-foreground mt-1">Próx: {formatDateDisplay(log.next_service_date)}</p>}
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  const openEditDialog = (log: MaintenanceLog) => {
    setEditingLogId(log.id);
    set("forkliftId", log.forklift_id);
    set("serviceType", log.service_type);
    set("description", log.description || "");
    set("cost", log.cost?.toString() || "");
    set("performedBy", log.performed_by || "");
    set("performedAt", log.performed_at ? parseISO(log.performed_at) : new Date());
    set("nextServiceDate", log.next_service_date ? parseISO(log.next_service_date) : undefined);
    set("supplierId", log.supplier_id || "");
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.serviceType) {
      toast.error("Montacargas y tipo de servicio son requeridos");
      return;
    }

    const payload = {
      forklift_id: form.forkliftId,
      service_type: form.serviceType,
      description: form.description || null,
      cost: form.cost ? parseFloat(form.cost) : 0,
      performed_by: form.performedBy || null,
      performed_at: format(form.performedAt, "yyyy-MM-dd"),
      next_service_date: form.nextServiceDate ? format(form.nextServiceDate, "yyyy-MM-dd") : null,
      supplier_id: form.supplierId || null,
    };

    if (editingLogId) {
      updateLog.mutate({ id: editingLogId, ...payload }, {
        onSuccess: () => {
          toast.success("Registro de mantenimiento actualizado");
          setDialogOpen(false);
          setEditingLogId(null);
          reset();
        },
      });
    } else {
      const selectedForklift = forkliftMap.get(form.forkliftId);
      createLog.mutate(payload, {
        onSuccess: () => {
          toast.success("Registro de mantenimiento agregado");
          setDialogOpen(false);
          if (selectedForklift && selectedForklift.status === "maintenance") {
            setAvailablePrompt({ forkliftId: selectedForklift.id, forkliftName: selectedForklift.name });
          }
          reset();
        },
      });
    }
  };

  const totalCost = logs?.reduce((sum, l) => sum + (l.cost || 0), 0) || 0;
  const isPending = editingLogId ? updateLog.isPending : createLog.isPending;

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
            <Button onClick={() => { reset(); setEditingLogId(null); setDialogOpen(true); }} size="sm">
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
          <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors" onClick={() => setSelectedLog(log)}>
            <TableCell className="font-mono text-sm">{formatDateDisplay(log.performed_at)}</TableCell>
            <TableCell className="font-medium">{forkliftMap.get(log.forklift_id)?.name || "—"}</TableCell>
            <TableCell>{log.service_type}</TableCell>
            <TableCell>{log.performed_by || "—"}</TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(log.cost || 0)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDateDisplay(log.next_service_date)}</TableCell>
          </TableRow>
        )}
        customContent={kanbanContent || mobileContent}
      />

      <MaintenanceDetailSheet
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(open) => { if (!open) setSelectedLog(null); }}
        forkliftName={selectedLog ? (forkliftMap.get(selectedLog.forklift_id)?.name || "—") : ""}
        onEdit={openEditDialog}
      />

      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingLogId(null); }}
        isEdit={!!editingLogId}
        isPending={isPending}
        form={form}
        set={set}
        onSubmit={handleSubmit}
        forklifts={forklifts}
        mechanics={activeMechanics}
      />

      {availablePrompt && (
        <MarkAvailableDialog
          open={!!availablePrompt}
          onOpenChange={(open) => { if (!open) setAvailablePrompt(null); }}
          forkliftId={availablePrompt.forkliftId}
          forkliftName={availablePrompt.forkliftName}
        />
      )}
    </>
  );
}
