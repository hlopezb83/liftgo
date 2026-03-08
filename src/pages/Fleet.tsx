import { useState } from "react";
import { useForklifts } from "@/hooks/useForklifts";
import { useMaintenancePolicies } from "@/hooks/useMaintenancePolicies";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";

import { StatusBadge } from "@/components/StatusBadge";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Download, ChevronRight, Forklift, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const { data: policies } = useMaintenancePolicies();
  const activePolicyForkliftIds = new Set(policies?.filter(p => p.is_active).map(p => p.forklift_id) ?? []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const filtered = forklifts?.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.model.toLowerCase().includes(search.toLowerCase()) || (f.manufacturer || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || f.status === statusFilter);
  });

  const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(filtered, {
    defaultKey: "name",
    accessors: {
      name: (f) => f.name,
      model: (f) => f.model,
      manufacturer: (f) => f.manufacturer || "",
      capacity_kg: (f) => f.capacity_kg || 0,
      mast_height_m: (f) => f.mast_height_m || 0,
      fuel_type: (f) => f.fuel_type || "",
      status: (f) => f.status,
      
    },
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(sortedItems);

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
      <Button variant="outline" size="sm" onClick={() => exportToCsv("flota.csv", (filtered || []).map(f => ({ Nombre: f.name, Modelo: f.model, Fabricante: f.manufacturer || "", Capacidad: f.capacity_kg || "", Combustible: f.fuel_type || "", Estado: f.status })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
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
            <p className="text-sm text-muted-foreground">{f.model} {f.manufacturer ? `· ${f.manufacturer}` : ""}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {f.capacity_kg && <span>{f.capacity_kg} kg</span>}
                {f.mast_height_m && <span>{f.mast_height_m} m</span>}
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
      skeletonColumns={7}
      tableHeader={
        <TableRow>
          <SortableTableHead sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>ID</SortableTableHead>
          <SortableTableHead sortKey="model" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Modelo</SortableTableHead>
          <SortableTableHead sortKey="manufacturer" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fabricante</SortableTableHead>
          <SortableTableHead sortKey="capacity_kg" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Capacidad</SortableTableHead>
          <SortableTableHead sortKey="mast_height_m" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Altura</SortableTableHead>
          <SortableTableHead sortKey="fuel_type" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Combustible</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          
        </TableRow>
      }
      renderRow={(f) => (
        <TableRow key={f.id} className="cursor-pointer hover:bg-accent/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/fleet/${f.id}`)}>
          <TableCell className="font-mono font-medium">
            <span className="flex items-center gap-1.5">
              {f.name}
              {activePolicyForkliftIds.has(f.id) && (
                <Tooltip><TooltipTrigger asChild><ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /></TooltipTrigger><TooltipContent>Póliza de mantenimiento activa</TooltipContent></Tooltip>
              )}
            </span>
          </TableCell>
          <TableCell>{f.model}</TableCell>
          <TableCell>{f.manufacturer || "—"}</TableCell>
          <TableCell>{f.capacity_kg ? `${f.capacity_kg} kg` : "—"}</TableCell>
          <TableCell>{f.mast_height_m ? `${f.mast_height_m} m` : "—"}</TableCell>
          <TableCell>{f.fuel_type ? (FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type) : "—"}</TableCell>
          <TableCell><StatusBadge status={f.status} /></TableCell>
          
        </TableRow>
      )}
    />
  );
}
