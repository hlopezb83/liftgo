import { useEffect } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { DeliveryMobileCard } from "../components/deliveries/DeliveryMobileCard";
import { deliveryQueries } from "../hooks/useDeliveries";
import { useOverdueDeliveriesPage } from "../hooks/useOverdueDeliveriesPage";
import { buildDeliveryColumns } from "./deliveryColumns";
import type { OverdueDeliveryItem } from "../lib/overdueDeliveriesPageRpc";

// The page RPC includes the authorized equipment name; no fleet-wide read is needed.
const EMPTY_FLEET = new Map<string, { name?: string | null }>();
const STATUS_OPTIONS = [
  { value: "all", label: "Programados y en tránsito" },
  { value: "scheduled", label: "Programados" },
  { value: "in_transit", label: "En tránsito" },
];
const TYPE_OPTIONS = [
  { value: "all", label: "Todos los tipos" },
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Recolección" },
  { value: "return", label: "Devolución" },
];

export function OverdueDeliveriesPage() {
  const navigate = useNavigateTransition();
  const { values, set, reset, hasActive } = useTableFilters<OverdueDeliveryItem, {
    q: { type: "text"; fields: (keyof OverdueDeliveryItem)[] };
    status: { type: "enum"; field: keyof OverdueDeliveryItem; options: readonly string[] };
    type: { type: "enum"; field: keyof OverdueDeliveryItem; options: readonly string[] };
  }>({
    mode: "server",
    facets: {
      q: { type: "text", fields: ["delivery_number", "driver_name", "address"] },
      status: { type: "enum", field: "status", options: ["all", "scheduled", "in_transit"] },
      type: { type: "enum", field: "type", options: ["all", "delivery", "pickup", "return"] },
    },
  });
  const view = useTableViewState(undefined, [{ id: "scheduled_date", desc: false }]);
  const { controlledPagination: pagination, controlledSorting: sorting, onControlledPaginationChange } = view;
  const { data, isLoading, isError, refetch } = useOverdueDeliveriesPage({
    search: values.q, status: values.status, type: values.type, ...pagination, sorting,
  });
  useEffect(() => {
    if (data && data.pageIndex !== pagination.pageIndex) {
      onControlledPaginationChange({ ...pagination, pageIndex: data.pageIndex });
    }
  }, [data, pagination, onControlledPaginationChange]);
  const table = useLiftgoTable<OverdueDeliveryItem>({
    ...view,
    data: data?.items,
    columns: buildDeliveryColumns<OverdueDeliveryItem>(EMPTY_FLEET, data?.today),
    getRowId: (row) => row.id,
    pageCount: Math.ceil((data?.totalCount ?? 0) / pagination.pageSize),
    manualSorting: true,
  });

  return (
    <ListPageLayout
      title="Transportes atrasados"
      subtitle="Revisa entregas, recolecciones y devoluciones pendientes"
      totalCount={isLoading || isError ? undefined : data?.totalCount}
      rowCount={data?.totalCount}
      onRefresh={refetch}
      actions={<Button variant="outline" size="sm" onClick={() => navigate("/deliveries")}>Ver todos los transportes</Button>}
      notice={<Alert><AlertDescription>
        Vista Atrasados: programados o en tránsito{data?.today ? ` con fecha anterior al ${formatDateMty(data.today)}` : " con fecha anterior a hoy"}.
        {" "}Se excluyen las conciliaciones históricas activas.
      </AlertDescription></Alert>}
      search={<FiltersToolbar.Search value={values.q} onChange={(v) => set("q", v)} placeholder="Buscar transportes atrasados…" />}
      filters={<FiltersToolbar>
        <FiltersToolbar.StatusSelect value={values.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} label="Estado" ariaLabel="Filtrar atrasados por estado" />
        <FiltersToolbar.StatusSelect value={values.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} label="Tipo" ariaLabel="Filtrar atrasados por tipo" />
        <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
      </FiltersToolbar>}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      rowAction={{ columnId: "delivery_number", label: (row) => `Ver transporte ${row.delivery_number}`, to: (row) => `/deliveries/${row.id}` }}
      onRowClick={(row) => navigate(`/deliveries/${row.id}`)}
      onRowPrefetch={(row) => deliveryQueries.detail(row.id)}
      activeFilterLabels={[
        "Vista: Transportes atrasados",
        ...(values.q ? [`Búsqueda: ${values.q}`] : []),
        ...(values.status !== "all" ? [`Estado: ${STATUS_OPTIONS.find((option) => option.value === values.status)?.label ?? values.status}`] : []),
        ...(values.type !== "all" ? [`Tipo: ${TYPE_OPTIONS.find((option) => option.value === values.type)?.label ?? values.type}`] : []),
      ]}
      hasActiveFilters={hasActive}
      onClearFilters={hasActive ? reset : undefined}
      emptyMessage="No hay transportes atrasados"
      emptyActionLabel="Ver todos los transportes"
      onEmptyAction={() => navigate("/deliveries")}
      mobileCardRender={(row) => <DeliveryMobileCard d={row} forkliftMap={EMPTY_FLEET} today={data?.today} />}
    />
  );
}
