import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useForklifts } from "@/hooks/useForkliftData";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { formatCurrency } from "@/lib/formatCurrency";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { Search, PlusCircle, Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { FORKLIFT_STATUSES } from "@/lib/constants";

export default function Fleet() {
  const { data: forklifts, isLoading } = useForklifts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();

  const filtered = forklifts?.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.model.toLowerCase().includes(search.toLowerCase()) || (f.manufacturer || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || f.status === statusFilter);
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Inventario de Flota"
        subtitle={`${forklifts?.length || 0} montacargas en la flota`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCsv("flota.csv", (filtered || []).map(f => ({ Nombre: f.name, Modelo: f.model, Fabricante: f.manufacturer || "", Capacidad: f.capacity_kg || "", Combustible: f.fuel_type || "", Estado: f.status, "Tarifa Diaria": f.daily_rate || 0 })))}><Download className="h-4 w-4 mr-1" />Exportar CSV</Button>
            <Button onClick={() => navigate("/fleet/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" /> Agregar Montacargas</Button>
          </div>
        }
      />
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, modelo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {FORKLIFT_STATUSES.map((s) => <SelectItem key={s} value={s}>{{ available: "Disponible", rented: "Rentado", maintenance: "Mantenimiento", retired: "Retirado" }[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead><TableHead>Modelo</TableHead><TableHead>Fabricante</TableHead>
                  <TableHead>Capacidad</TableHead><TableHead>Altura</TableHead><TableHead>Combustible</TableHead><TableHead>Estado</TableHead>
                  <TableHead className="text-right">Tarifa Diaria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer hover:bg-accent/50 transition-colors duration-150 border-l-2 border-transparent hover:border-primary" onClick={() => navigate(`/fleet/${f.id}`)}>
                    <TableCell className="font-mono font-medium">{f.name}</TableCell>
                    <TableCell>{f.model}</TableCell>
                    <TableCell>{f.manufacturer || "—"}</TableCell>
                    <TableCell>{f.capacity_kg ? `${f.capacity_kg} kg` : "—"}</TableCell>
                    <TableCell>{f.mast_height_m ? `${f.mast_height_m} m` : "—"}</TableCell>
                    <TableCell>{f.fuel_type}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(f.daily_rate || 0)}/día</TableCell>
                  </TableRow>
                ))}
                {paginatedItems.length === 0 && <EmptyRow colSpan={8} message="No se encontraron montacargas" />}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  );
}
