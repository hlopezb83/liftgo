import { useMemo } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { Forklift as ForkliftIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { usePageActions } from "@/contexts/pageActions";
import { useHasModuleAccess } from "@/features/users";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { FORKLIFT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { exportToCsv } from "@/lib/exportCsv";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { FleetExportAction, FleetPageActions, FleetPrimaryAction } from "../components/fleet/FleetPageActions";
import { FleetMobileCard } from "../components/fleet/FleetRowAndCard";
import { useFleetColumns } from "../hooks/fleet/useFleetColumns";
import { useFleetLocations } from "../hooks/forklifts/useFleetLocations";
import { useForkliftsIncremental } from "../hooks/forklifts/useForklifts";
import { useOccupiedForkliftIdsToday } from "../hooks/forklifts/useOccupiedForkliftIdsToday";
import type { Forklift } from "../hooks/forklifts/useForklifts";

const STATUS_OPTIONS = [
  { value: "all" as const, label: "Todos los estados" },
  ...FORKLIFT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
];

const EMPTY_MAP: Map<string, string> = new Map();
const EMPTY_SET: Set<string> = new Set();

export default function FleetPage() {
  const forkliftPages = useForkliftsIncremental();
  const { isLoading, isError, refetch } = forkliftPages;
  const forklifts = useMemo(() => forkliftPages.data?.pages.flatMap((page) => page.slice(0, LIST_PAGE_LIMIT)) ?? [], [forkliftPages.data]);
  // Ocupación operativa compartida con Panel y Calendario: una reserva
  // confirmada vigente ocupa una unidad available; una completada no lo hace.
  const { data: rentedIds, isLoading: occupiedLoading, isError: occupiedError, refetch: refetchOccupied } = useOccupiedForkliftIdsToday();
  // La RPC cuenta como comprometida una unidad con reserva confirmada vigente
  // hoy, con el mismo criterio del tablero y sin límite de filas.

  // v7.281.1 · memoizado: sin esto el arreglo era nuevo en cada render y la
  // tabla reiniciaba la paginación a la página 1.
  const forkliftsForFilter = useMemo(
    () =>
      (forklifts ?? []).map((f) => {
        if (!rentedIds || f.status !== "available") return f;
        const derived = rentedIds.has(f.id) ? ("rented" as const) : ("available" as const);
        return derived === f.status ? f : { ...f, status: derived };
      }),
    [forklifts, rentedIds],
  );

  // Tanda 3 P1-5: 1 request a la vista `forklift_current_location`
  // reemplaza useContracts + useDeliveries + useMaintenancePolicies.
  const { data: fleetLocations } = useFleetLocations();
  const locationMap = fleetLocations?.locationMap ?? EMPTY_MAP;
  const activePolicyForkliftIds = fleetLocations?.activePolicyForkliftIds ?? EMPTY_SET;

  const navigate = useNavigateTransition();
  const canWrite = useHasModuleAccess("Flota", "full");
  usePageActions({ onNew: canWrite ? () => navigate("/fleet/new") : undefined, newLabel: canWrite ? "Nuevo equipo" : undefined });

  const columns = useFleetColumns(activePolicyForkliftIds, locationMap);


  const { values, set, filtered, filterKey, hasActive, reset } = useTableFilters<
    Forklift,
    {
      q: { type: "text"; fields: (keyof Forklift)[] };
      status: { type: "enum"; field: keyof Forklift; options: readonly string[] };
    }
  >({
    items: forkliftsForFilter,
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

  const notice = forkliftPages.hasNextPage ? <p className="text-xs text-muted-foreground">La búsqueda incluye los equipos cargados. Usa «Cargar más» para ampliar la lista; la exportación estará disponible al cargar todos.</p> : null;

  const filters = (
    <div className="space-y-3">
      <FiltersToolbar>
        <FiltersToolbar.StatusSelect
          value={values.status as string}
          onChange={(v) => set("status", v)}
          options={STATUS_OPTIONS}
          placeholder="Todos los estados"
        />
        <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
      </FiltersToolbar>
    </div>
  );

  const openCreate = () => navigate("/fleet/new");
  const exportFleet = () => exportToCsv(
    "flota.csv",
    filtered.map((f: Forklift) => ({
      Nombre: f.name,
      Modelo: f.model,
      "No. de Serie": f.serial_number || "",
      Combustible: f.fuel_type || "",
      Estado: f.status,
    })),
  );

  return (
    <ListPageLayout
      title="Equipos"
      subtitle={forkliftPages.hasNextPage ? `${forklifts.length}+ equipos cargados` : `${forklifts.length} montacargas en la flota`}
      actions={<FleetPageActions onCreate={openCreate} onExport={exportFleet} exportDisabled={forkliftPages.hasNextPage} />}
      mobilePrimaryAction={<FleetPrimaryAction onCreate={openCreate} compact />}
      mobileActions={<FleetExportAction onExport={exportFleet} exportDisabled={forkliftPages.hasNextPage} compact />}
      notice={notice}
      search={
        <FiltersToolbar.Search
          value={values.q}
          onChange={(v) => set("q", v)}
          placeholder="Buscar por nombre, modelo…"
          className="w-full sm:min-w-64 sm:max-w-[45rem]"
        />
      }
      filters={filters}
      isLoading={isLoading || occupiedLoading}
      isError={isError || occupiedError}
      hasMoreRows={forkliftPages.hasNextPage}
      loadMore={{ hasMore: forkliftPages.hasNextPage, isLoading: forkliftPages.isFetchingNextPage,
        onClick: () => { void forkliftPages.fetchNextPage(); }, loaded: forklifts.length }}
      onRetry={() => { void refetch(); void refetchOccupied(); }}
      onRefresh={() => { void refetch(); void refetchOccupied(); }}
      table={table}
      onRowClick={(f) => navigate(`/fleet/${f.id}`)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No se encontraron montacargas"
      emptyIcon={ForkliftIcon}
      emptyActionLabel={canWrite ? "Agregar montacargas" : undefined}
      onEmptyAction={canWrite ? () => navigate("/fleet/new") : undefined}
      skeletonColumns={6}
      mobileCardRender={(f) => (
        <FleetMobileCard
          forklift={f}
          hasActivePolicy={activePolicyForkliftIds.has(f.id)}
          location={locationMap.get(f.id)}
          onClick={() => navigate(`/fleet/${f.id}`)}
        />
      )}
    />
  );
}
