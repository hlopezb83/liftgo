import { useState } from "react";
import { useForklifts } from "@/hooks/useForklifts";
import { usePagination } from "@/hooks/usePagination";
import { formatCurrency } from "@/lib/formatCurrency";
import { StatusBadge } from "@/components/StatusBadge";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { PlusCircle, Download, ChevronRight } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const filtered = forklifts?.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.model.toLowerCase().includes(search.toLowerCase()) || (f.manufacturer || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || f.status === statusFilter);
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

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
      <Button variant="outline" size="sm" onClick={() => exportToCsv("flota.csv", (filtered || []).map(f => ({ Nombre: f.name, Modelo: f.model, Fabricante: f.manufacturer || "", Capacidad: f.capacity_kg || "", Combustible: f.fuel_type || "", Estado: f.status, "Tarifa Diaria": f.daily_rate || 0 })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
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
              <span className="font-mono font-semibold text-sm">{f.name}</span>
              <StatusBadge status={f.status} />
            </div>
            <p className="text-sm text-muted-foreground">{f.model} {f.manufacturer ? `· ${f.manufacturer}` : ""}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="flex gap-4 text-xs text-muted-foreground">
                {f.capacity_kg && <span>{f.capacity_kg} kg</span>}
                {f.mast_height_m && <span>{f.mast_height_m} m</span>}
                {f.fuel_type && <span>{FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type}</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium">{formatCurrency(f.daily_rate || 0)}/día</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
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
      customContent={mobileContent}
      tableHeader={
        <TableRow>
          <TableHead>ID</TableHead><TableHead>Modelo</TableHead><TableHead>Fabricante</TableHead>
          <TableHead>Capacidad</TableHead><TableHead>Altura</TableHead><TableHead>Combustible</TableHead><TableHead>Estado</TableHead>
          <TableHead className="text-right">Tarifa Diaria</TableHead>
        </TableRow>
      }
      renderRow={(f) => (
        <TableRow key={f.id} className="cursor-pointer hover:bg-accent/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/fleet/${f.id}`)}>
          <TableCell className="font-mono font-medium">{f.name}</TableCell>
          <TableCell>{f.model}</TableCell>
          <TableCell>{f.manufacturer || "—"}</TableCell>
          <TableCell>{f.capacity_kg ? `${f.capacity_kg} kg` : "—"}</TableCell>
          <TableCell>{f.mast_height_m ? `${f.mast_height_m} m` : "—"}</TableCell>
          <TableCell>{f.fuel_type ? (FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type) : "—"}</TableCell>
          <TableCell><StatusBadge status={f.status} /></TableCell>
          <TableCell className="text-right font-medium">{formatCurrency(f.daily_rate || 0)}/día</TableCell>
        </TableRow>
      )}
    />
  );
}
