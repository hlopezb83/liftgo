import { useCallback, useMemo } from "react";
import { useForklifts } from "@/hooks/useForklifts";
import { useMaintenancePolicies } from "@/hooks/useMaintenancePolicies";
import { useContracts } from "@/hooks/useContracts";
import { useDeliveries } from "@/hooks/useDeliveries";
import { useListPage } from "@/hooks/useListPage";

import { StatusBadge } from "@/components/StatusBadge";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlusCircle, Download, ChevronRight, Forklift, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const { data: policies } = useMaintenancePolicies();
  const { data: contracts } = useContracts();
  const { data: deliveries } = useDeliveries();
  const activePolicyForkliftIds = new Set(policies?.filter(p => p.is_active).map(p => p.forklift_id) ?? []);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const statusFilter = searchParams.get("status") || "all";
  const navigate = useNavigate();

  // Build location map: forklift_id -> location string
  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    // From active contracts
    contracts?.forEach((c) => {
      if (c.forklift_id && c.status === "active" && c.usage_location) {
        map.set(c.forklift_id, c.usage_location);
      }
    });
    // From latest completed delivery (if no contract location)
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

  const filtered = forklifts?.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.model.toLowerCase().includes(search.toLowerCase()) || (f.manufacturer || "").toLowerCase().includes(search.toLowerCase()) || (f.serial_number || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || f.status === statusFilter);
  });

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    defaultSortKey: "name",
    accessors: {
      name: (f) => f.name,
      model: (f) => f.model,
      serial_number: (f) => f.serial_number || "",
      fuel_type: (f) => f.fuel_type || "",
      status: (f) => f.status,
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
      <Button variant="outline" size="sm" onClick={() => exportToCsv("flota.csv", (filtered || []).map(f => ({ Nombre: f.name, Modelo: f.model, "No. de Serie": f.serial_number || "", Combustible: f.fuel_type || "", Estado: f.status })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
      <Button onClick={() => navigate("/fleet/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Agregar Montacargas</Button>
    </div>
  );

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(f) => f.id}
      emptyMessage="No se encontraron montacargas"
      renderCard={(f) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/fleet/${f.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-semibold text-sm flex items-center gap-1.5">
                {f.name}
                {activePolicyForkliftIds.has(f.id) && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
              </span>
              <StatusBadge status={f.status} />
            </div>
            <p className="text-sm text-muted-foreground">{f.model}</p>
            {f.serial_number && <p className="text-xs text-muted-foreground font-mono">S/N: {f.serial_number}</p>}
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {f.fuel_type && <span>{FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type}</span>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  return (
    <ListPageLayout
      title="Inventario de Flota"
      subtitle={`${forklifts?.length || 0} montacargas en la flota`}
      actions={actions}
      filters={filters}
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron montacargas"
      emptyIcon={Forklift}
      emptyActionLabel="Agregar Montacargas"
      onEmptyAction={() => navigate("/fleet/new")}
      customContent={mobileContent}
      skeletonColumns={5}
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>ID</SortableTableHead>
          <SortableTableHead sortKey="model" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Modelo</SortableTableHead>
          <SortableTableHead sortKey="serial_number" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>No. de Serie</SortableTableHead>
          <SortableTableHead sortKey="fuel_type" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Combustible</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          <TableHead className="hidden lg:table-cell">Ubicación</TableHead>
        </TableRow>
      }
      renderRow={(f) => (
        <TableRow key={f.id} className="cursor-pointer hover:bg-muted/50 transition-colors border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/fleet/${f.id}`)}>
          <TableCell className="font-mono font-medium">
            <span className="flex items-center gap-1.5">
              {f.name}
              {activePolicyForkliftIds.has(f.id) && (
                <Tooltip><TooltipTrigger asChild><ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /></TooltipTrigger><TooltipContent>Póliza de mantenimiento activa</TooltipContent></Tooltip>
              )}
            </span>
          </TableCell>
          <TableCell>{f.model}</TableCell>
          <TableCell className="font-mono text-xs">{f.serial_number || "—"}</TableCell>
          <TableCell>{f.fuel_type ? (FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type) : "—"}</TableCell>
          <TableCell><StatusBadge status={f.status} /></TableCell>
        </TableRow>
      )}
    />
  );
}
