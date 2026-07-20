import { useLiftgoTable } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { AddIcon, DownloadIcon, Forklift as ForkliftIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { usePageActions } from "@/contexts/pageActions";
import { useContracts } from "@/features/contracts";
import { useDeliveries } from "@/features/deliveries";
import { useMaintenancePolicies } from "@/features/maintenance";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { FORKLIFT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { exportToCsv } from "@/lib/exportCsv";
import { FleetMobileCard } from "../components/fleet/FleetRowAndCard";
import { useFleetColumns } from "../hooks/fleet/useFleetColumns";
import { useForklifts } from "../hooks/forklifts/useForklifts";
import type { Forklift } from "../hooks/forklifts/useForklifts";

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Todos los estados" },
  ...FORKLIFT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
];

export default function FleetPage() {
  const { data: forklifts, isLoading, isError, refetch } = useForklifts();
  const { data: policies } = useMaintenancePolicies();
  const { data: contracts } = useContracts();
  const { data: deliveries } = useDeliveries();

  const activePolicyForkliftIds = new Set(policies?.filter((p) => p.is_active).map((p) => p.forklift_id) ?? []);

  const locationMap = (() => {
    const map = new Map<string, string>();
    contracts?.forEach((c) => {
      if (c.forklift_id && c.status === "active" && c.usage_location) {
        map.set(c.forklift_id, c.usage_location);
      }
    });
    deliveries?.forEach((d) => {
      if (d.address && !map.has(d.forklift_id)) {
        map.set(d.forklift_id, d.address);
      }
    });
    return map;
  })();

  const navigate = useNavigateTransition();
  usePageActions({ onNew: () => navigate("/fleet/new"), newLabel: "Nuevo equipo" });

  const columns = useFleetColumns(activePolicyForkliftIds, locationMap);

  const { values, set, filtered, filterKey, hasActive, reset } = useTableFilters<
    Forklift,
    {
      q: { type: "text"; fields: (keyof Forklift)[] };
      status: { type: "enum"; field: keyof Forklift; options: readonly string[] };
    }
  >({
    items: forklifts ?? [],
    facets: {
      q: { type: "text", fields: ["name", "model", "manufacturer", "serial_number"] },
      status: { type: "enum", field: "status", options: FORKLIFT_STATUSES },
    },
  });

  const table = useLiftgoTable<Forklift>({
    data: filtered,
    columns,
    getRowId: (f: Forklift) => f.id,
    initialSorting: [{ id: "name", desc: false }],
    resetKey: filterKey,
  });

  const filters = (
    <FiltersToolbar>
      <FiltersToolbar.Search
        value={values.q}
        onChange={(v) => set("q", v)}
        placeholder="Buscar por nombre, modelo..."
      />
      <FiltersToolbar.StatusSelect
        value={values.status as string}
        onChange={(v) => set("status", v)}
        options={STATUS_OPTIONS}
        placeholder="Todos los estados"
      />
      <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
    </FiltersToolbar>
  );

  const actions = (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          exportToCsv(
            "flota.csv",
            filtered.map((f: Forklift) => ({
              Nombre: f.name,
              Modelo: f.model,
              "No. de Serie": f.serial_number || "",
              Combustible: f.fuel_type || "",
              Estado: f.status,
            })),
          )
        }
      >
        <DownloadIcon className="h-4 w-4 mr-1" />
        Exportar CSV
      </Button>
      <Button onClick={() => navigate("/fleet/new")} size="sm">
        <AddIcon className="h-4 w-4 mr-1" /> Agregar Montacargas
      </Button>
    </div>
  );

  return (
    <ListPageLayout
      title="Equipos"
      subtitle={`${forklifts?.length || 0} montacargas en la flota`}
      actions={actions}
      filters={filters}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(f) => navigate(`/fleet/${f.id}`)}
      emptyMessage="No se encontraron montacargas"
      emptyIcon={ForkliftIcon}
      emptyActionLabel="Agregar Montacargas"
      onEmptyAction={() => navigate("/fleet/new")}
      skeletonColumns={6}
      mobileCardRender={(f) => (
        <FleetMobileCard
          forklift={f}
          hasActivePolicy={activePolicyForkliftIds.has(f.id)}
          onClick={() => navigate(`/fleet/${f.id}`)}
        />
      )}
    />
  );
}
