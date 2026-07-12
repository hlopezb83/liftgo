import { SearchBar } from "@/components/forms/SearchBar";
import { AddIcon, DownloadIcon, Forklift as ForkliftIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageActions } from "@/contexts/pageActions";
import { useContracts } from "@/features/contracts";
import { useDeliveries } from "@/features/deliveries";
import { useMaintenancePolicies } from "@/features/maintenance";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useResourceList } from "@/hooks/useResourceList";
import { FORKLIFT_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { exportToCsv } from "@/lib/exportCsv";
import { FleetMobileCard } from "../components/fleet/FleetRowAndCard";
import { useFleetColumns } from "../hooks/fleet/useFleetColumns";
import { useForklifts } from "../hooks/forklifts/useForklifts";
import type { Forklift } from "../hooks/forklifts/useForklifts";

export default function FleetPage() {
  const { data: forklifts, isLoading } = useForklifts();
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

  const { search, setSearch, statusFilter, setStatusFilter, filtered, table } =
    useResourceList<Forklift>({
      items: forklifts,
      columns,
      getRowId: (f) => f.id,
      initialSorting: [{ id: "name", desc: false }],
      filters: {
        searchFields: ["name", "model", "manufacturer", "serial_number"],
        statusField: "status",
      },
    });

  const filters = (
    <div className="flex gap-3">
      <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, modelo..." />
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los estados</SelectItem>
          {FORKLIFT_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportToCsv("flota.csv", filtered.map((f) => ({ Nombre: f.name, Modelo: f.model, "No. de Serie": f.serial_number || "", Combustible: f.fuel_type || "", Estado: f.status })))}>
        <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      <Button onClick={() => navigate("/fleet/new")} size="sm"><AddIcon className="h-4 w-4 mr-1" /> Agregar Montacargas</Button>
    </div>
  );

  return (
    <ListPageLayout
      title="Equipos"
      subtitle={`${forklifts?.length || 0} montacargas en la flota`}
      actions={actions}
      filters={filters}
      isLoading={isLoading}
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
