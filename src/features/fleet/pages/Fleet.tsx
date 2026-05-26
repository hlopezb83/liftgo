import { useCallback, useMemo } from "react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useMaintenancePolicies } from "@/features/maintenance/hooks/maintenance/useMaintenancePolicies";
import { useContracts } from "@/features/contracts/hooks/useContracts";
import { useDeliveries } from "@/features/deliveries/hooks/useDeliveries";
import type { Forklift } from "@/features/fleet/hooks/forklifts/useForklifts";

import { ListPageLayout } from "@/components/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/StatusBadge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusCircle, Download, Forklift as ForkliftIcon, ShieldCheck } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import { FleetMobileCard } from "@/features/fleet/components/fleet/FleetRowAndCard";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const { data: policies } = useMaintenancePolicies();
  const { data: contracts } = useContracts();
  const { data: deliveries } = useDeliveries();
  const activePolicyForkliftIds = useMemo(
    () => new Set(policies?.filter((p) => p.is_active).map((p) => p.forklift_id) ?? []),
    [policies],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "all";
  const navigate = useNavigate();

  const locationMap = useMemo(() => {
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
  }, [contracts, deliveries]);

  const setSearch = useCallback((value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("q", value); else next.delete("q");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setStatusFilter = useCallback((value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "all") next.set("status", value); else next.delete("status");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const filtered = useMemo(
    () =>
      (forklifts ?? []).filter((f) => {
        const q = search.toLowerCase();
        const matchesSearch =
          f.name.toLowerCase().includes(q) ||
          f.model.toLowerCase().includes(q) ||
          (f.manufacturer || "").toLowerCase().includes(q) ||
          (f.serial_number || "").toLowerCase().includes(q);
        return matchesSearch && (statusFilter === "all" || f.status === statusFilter);
      }),
    [forklifts, search, statusFilter],
  );

  const columns = useMemo<ColumnDef<Forklift>[]>(
    () => [
      {
        id: "name",
        header: "ID",
        accessorKey: "name",
        cell: ({ row }) => {
          const f = row.original;
          return (
            <span className="font-mono font-medium flex items-center gap-1.5">
              {f.name}
              {activePolicyForkliftIds.has(f.id) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Póliza de mantenimiento activa</TooltipContent>
                </Tooltip>
              )}
            </span>
          );
        },
      },
      { id: "model", header: "Modelo", accessorKey: "model" },
      {
        id: "serial_number",
        header: "No. de Serie",
        accessorFn: (f) => f.serial_number || "",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.serial_number || "—"}</span>,
      },
      {
        id: "fuel_type",
        header: "Combustible",
        accessorFn: (f) => f.fuel_type || "",
        cell: ({ row }) => (row.original.fuel_type ? (FUEL_TYPE_LABELS[row.original.fuel_type] || row.original.fuel_type) : "—"),
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "location",
        header: "Ubicación",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate" },
        cell: ({ row }) => locationMap.get(row.original.id) || "—",
      },
    ],
    [activePolicyForkliftIds, locationMap],
  );

  const table = useLiftgoTable<Forklift>({
    data: filtered,
    columns,
    getRowId: (f) => f.id,
    initialSorting: [{ id: "name", desc: false }],
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
        <Download className="h-4 w-4 mr-1" />Exportar CSV
      </Button>
      <Button onClick={() => navigate("/fleet/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Agregar Montacargas</Button>
    </div>
  );

  return (
    <ListPageLayout
      title="Inventario de Flota"
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
