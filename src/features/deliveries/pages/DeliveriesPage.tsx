import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { WarnIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useForkliftMap } from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { applyFacetFilters } from "@/hooks/filters/applyFacetFilters";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useToggleDialog } from "@/hooks/useDialogState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useSearchParams } from "@/lib/router-compat";
import { visibleListRows } from "@/lib/supabase/constants";
import { DeliveryFormDialog } from "../components/deliveries/DeliveryFormDialog";
import { DeliveryMobileCard } from "../components/deliveries/DeliveryMobileCard";
import { useDeliveries, deliveryQueries } from "../hooks/useDeliveries";
import { countOverdueDeliveries } from "../lib/deliveryOverdue";
import { selectDeliveryHistory } from "../lib/historicalReconciliation";
import { buildDeliveryColumns } from "./deliveryColumns";
import { OverdueDeliveriesPage } from "./OverdueDeliveriesPage";


type Delivery = NonNullable<ReturnType<typeof useDeliveries>["data"]>[number];

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


export default function DeliveriesPage() {
  const [params] = useSearchParams();
  return params.get("view") === "overdue" ? <OverdueDeliveriesPage /> : <DeliveriesList />;
}

function DeliveriesList() {
  const navigate = useNavigateTransition();
  const { forkliftMap } = useForkliftMap();
  const { data: deliveriesRaw, isLoading, isError, refetch } = useDeliveries();
  const deliveries = visibleListRows(deliveriesRaw);
  // Control externo del diálogo para abrirlo también desde el CTA del
  // EmptyState (mismo patrón que InventoryPage/PartFormDialog).
  const scheduleDialog = useToggleDialog();
  const canSchedule = useHasModuleAccess("Entregas", "full");

  // Ronda C (C2): filtros estándar por estado y tipo — antes la lista mezclaba
  // entregas, recolecciones y completadas sin manera de separarlas.
  const { values, set, reset, hasActive, facets } = useTableFilters<Delivery, {
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

  const filtered = applyFacetFilters(deliveries ?? [], { q: facets.q, status: facets.status, type: facets.type }, values);
  const visibleDeliveries = selectDeliveryHistory(filtered, values.history);
  const overdueCount = countOverdueDeliveries(deliveries);

  const columns = buildDeliveryColumns<Delivery>(forkliftMap);

  const table = useLiftgoTable<Delivery>({
    data: visibleDeliveries,
    columns,
    getRowId: (d) => d.id,
  });

  return (
    <ListPageLayout
      title="Entregas"
      subtitle="Programa y rastrea el transporte de equipos"
      totalCount={visibleDeliveries.length}
      onRefresh={refetch}
      actions={<div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/deliveries?view=overdue")}>Transportes atrasados</Button>
        <DeliveryFormDialog open={scheduleDialog.open} onOpenChange={scheduleDialog.setOpen} />
      </div>}
      notice={
        <div className="space-y-3">
          {overdueCount > 0 && (
            <Alert variant="destructive">
              <WarnIcon className="h-4 w-4" />
              <AlertDescription>
                {overdueCount === 1
                  ? "Hay 1 transporte atrasado en la lista cargada. Revisa la vista de transportes atrasados."
                  : `Hay ${overdueCount} transportes atrasados en la lista cargada. Revisa la vista de transportes atrasados.`}
              </AlertDescription>
            </Alert>
          )}
          <ListTruncationNotice rows={deliveriesRaw} />
        </div>
      }
      filters={
        <FiltersToolbar>
          <FiltersToolbar.StatusSelect
            value={values.history}
            onChange={(v) => set("history", v)}
            options={[{ value: "all", label: "Sin conciliación histórica" }, { value: "history", label: "Historial completo" }, { value: "reconciled", label: "Conciliadas históricamente" }]}
            placeholder="Vista de entregas"
          />
          <FiltersToolbar.Search
            value={values.q}
            onChange={(v) => set("q", v)}
            placeholder="Buscar entregas…"
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
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No hay entregas programadas"
      emptyActionLabel={canSchedule ? "Programar entrega" : undefined}
      onEmptyAction={canSchedule ? scheduleDialog.openDialog : undefined}
      mobileCardRender={(d) => (
        <DeliveryMobileCard d={d} forkliftMap={forkliftMap} />
      )}
    />
  );
}
