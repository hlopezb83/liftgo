import { useDamageRecords } from "@/hooks/useDamageRecords";
import { useListFilters } from "@/hooks/useListFilters";
import { usePagination } from "@/hooks/usePagination";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { DamageActions } from "@/components/DamageActions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { DAMAGE_STATUSES, STATUS_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function DamageTrackingPage() {
  const { data: records, isLoading } = useDamageRecords();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(records, {
    searchFields: ["description"],
    statusField: "status",
  });

  // Also filter by forklift/customer names (nested fields not in searchFields)
  const extraFiltered = filtered?.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.description.toLowerCase().includes(q) ||
      (r.forklifts?.name || "").toLowerCase().includes(q) ||
      (r.customers?.name || "").toLowerCase().includes(q)
    );
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(extraFiltered);

  return (
    <ListPageLayout
      title="Seguimiento de Daños"
      subtitle="Rastrea daños desde inspecciones hasta reparación y facturación"
      filters={
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por descripción, montacargas..." />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {DAMAGE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No se encontraron registros de daños"
      tableHeader={
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Montacargas</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Costo Est.</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      }
      renderRow={(r) => (
        <TableRow key={r.id}>
          <TableCell className="font-mono text-sm">{format(new Date(r.created_at), "d MMM yyyy", { locale: es })}</TableCell>
          <TableCell className="font-medium">{r.forklifts?.name || "—"}</TableCell>
          <TableCell>{r.customers?.name || "—"}</TableCell>
          <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
          <TableCell className="font-mono">{formatCurrency(r.estimated_cost)}</TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell><DamageActions record={r} /></TableCell>
        </TableRow>
      )}
    />
  );
}
