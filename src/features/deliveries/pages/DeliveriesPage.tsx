import { useEffect } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { WarnIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useToggleDialog } from "@/hooks/useDialogState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useSearchParams } from "@/lib/router-compat";
import { DeliveryFormDialog } from "../components/deliveries/DeliveryFormDialog";
import { DeliveryMobileCard } from "../components/deliveries/DeliveryMobileCard";
import { deliveryQueries } from "../hooks/useDeliveries";
import { useDeliveriesPage } from "../hooks/useDeliveriesPage";
import { deliveryTypeLabel } from "../lib/deliveryTypeLabel";
import { buildDeliveryColumns } from "./deliveryColumns";
import { OverdueDeliveriesPage } from "./OverdueDeliveriesPage";
import type { DeliveryPageItem } from "../lib/deliveriesPageRpc";


type Delivery = DeliveryPageItem;
const EMPTY_FLEET = new Map<string, { name?: string | null }>();

const DELIVERY_STATUSES = ["scheduled", "in_transit", "completed", "cancelled"] as const;
const STATUS_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Programadas" },
  { value: "in_transit", label: "En tránsito" },
  { value: "completed", label: "Completadas" },
  { value: "cancelled", label: "Canceladas" },
];
const DELIVERY_TYPES = ["delivery", "pickup", "return"] as const;
const TYPE_OPTIONS = [
  { value: "all", label: "Todos los tipos" },
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Recolección" },
  { value: "return", label: "Devolución" },
];

function deliveryFilterLabels(values: { q: string; status: string; type: string; history: string }) {
  const labels: string[] = [];
  if (values.q) labels.push(`Búsqueda: ${values.q}`);
  if (values.status !== "all") labels.push(`Estado: ${STATUS_OPTIONS.find((option) => option.value === values.status)?.label ?? values.status}`);
  if (values.type !== "all") labels.push(`Tipo: ${deliveryTypeLabel(values.type)}`);
  if (values.history !== "all") labels.push(`Vista: ${values.history === "reconciled" ? "Conciliadas históricamente" : "Historial completo"}`);
  return labels;
}

function DeliveryOverdueNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return <Alert variant="destructive">
    <WarnIcon className="h-4 w-4" />
    <AlertDescription>
      {count === 1
        ? "Hay 1 transporte atrasado pendiente de atender. Revisa la vista de transportes atrasados."
        : `Hay ${count} transportes atrasados pendientes de atender. Revisa la vista de transportes atrasados.`}
    </AlertDescription>
  </Alert>;
}

export default function DeliveriesPage() {
  const [params] = useSearchParams();
  return params.get("view") === "overdue" ? <OverdueDeliveriesPage /> : <DeliveriesList />;
}

function DeliveriesList() {
  const navigate = useNavigateTransition();
  // Control externo del diálogo para abrirlo también desde el CTA del
  // EmptyState (mismo patrón que InventoryPage/PartFormDialog).
  const scheduleDialog = useToggleDialog();
  const canSchedule = useHasModuleAccess("Entregas", "full");

  // Ronda C (C2): filtros estándar por estado y tipo — antes la lista mezclaba
  // entregas, recolecciones y completadas sin manera de separarlas.
  const { values, set, reset, hasActive } = useTableFilters<Delivery, {
    q: { type: "text"; fields: (keyof Delivery)[] };
    status: { type: "enum"; field: keyof Delivery; options: readonly string[] };
    history: { type: "enum"; options: readonly string[] };
    type: { type: "enum"; field: keyof Delivery; options: readonly string[] };
  }>({
    mode: "server",
    facets: {
      q: { type: "text", fields: ["delivery_number", "driver_name", "address"] as (keyof Delivery)[] },
      status: { type: "enum", field: "status", options: ["all", ...DELIVERY_STATUSES] },
      history: { type: "enum", options: ["all", "history", "reconciled"] },
      type: { type: "enum", field: "type", options: ["all", ...DELIVERY_TYPES] },
    },
  });

  const view = useTableViewState(undefined, [{ id: "scheduled_date", desc: false }]);
  const { controlledPagination: pagination, controlledSorting: sorting, onControlledPaginationChange } = view;
  const { data, isLoading, isError, refetch } = useDeliveriesPage({
    search: values.q, status: values.status, type: values.type, history: values.history, ...pagination, sorting,
  });
  useEffect(() => {
    if (data && data.pageIndex !== pagination.pageIndex) {
      onControlledPaginationChange({ ...pagination, pageIndex: data.pageIndex });
    }
  }, [data, pagination, onControlledPaginationChange]);
  const table = useLiftgoTable<Delivery>({
    ...view,
    data: data?.items,
    columns: buildDeliveryColumns<Delivery>(EMPTY_FLEET, data?.today),
    getRowId: (d) => d.id,
    pageCount: Math.ceil((data?.totalCount ?? 0) / pagination.pageSize),
    manualSorting: true,
  });

  return (
    <ListPageLayout
      title="Entregas"
      subtitle="Programa y rastrea el transporte de equipos"
      totalCount={isLoading || isError ? undefined : data?.totalCount}
      rowCount={data?.totalCount}
      onRefresh={refetch}
      actions={<div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/deliveries?view=overdue")}>Transportes atrasados</Button>
        <DeliveryFormDialog open={scheduleDialog.open} onOpenChange={scheduleDialog.setOpen} />
      </div>}
      notice={<DeliveryOverdueNotice count={data?.overdueCount ?? 0} />}
      search={<FiltersToolbar.Search value={values.q} onChange={(v) => set("q", v)} placeholder="Buscar entregas…" className="w-full sm:w-64 sm:flex-none" />}
      stackedControls
      filters={
        <FiltersToolbar>
          <FiltersToolbar.StatusSelect
            value={values.history}
            onChange={(v) => set("history", v)}
            options={[{ value: "all", label: "Sin conciliación histórica" }, { value: "history", label: "Historial completo" }, { value: "reconciled", label: "Conciliadas históricamente" }]}
            placeholder="Vista de entregas"
          />
          <FiltersToolbar.StatusTabs
            value={values.status}
            onChange={(v) => set("status", v)}
            options={STATUS_OPTIONS}
          />
          <FiltersToolbar.StatusSelect
            value={values.type}
            onChange={(v) => set("type", v)}
            options={TYPE_OPTIONS}
            placeholder="Todos los tipos"
          />

          <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
        </FiltersToolbar>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      rowAction={{ columnId: "delivery_number", label: (d) => `Ver transporte ${d.delivery_number}`, to: (d) => `/deliveries/${d.id}` }}
      onRowClick={(d) => navigate(`/deliveries/${d.id}`)}
      onRowPrefetch={(d) => deliveryQueries.detail(d.id)}
      activeFilterLabels={deliveryFilterLabels(values)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No hay entregas programadas"
      emptyActionLabel={canSchedule ? "Programar entrega" : undefined}
      onEmptyAction={canSchedule ? scheduleDialog.openDialog : undefined}
      mobileCardRender={(d) => (
        <DeliveryMobileCard d={d} forkliftMap={EMPTY_FLEET} today={data?.today} />
      )}
    />
  );
}
