import { useQuotes } from "@/hooks/useQuotes";
import { useNavigate } from "react-router-dom";
import { useListFilters } from "@/hooks/useListFilters";
import { usePagination } from "@/hooks/usePagination";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { STATUS_LABELS } from "@/lib/constants";
import { PlusCircle } from "lucide-react";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"];

export default function QuotesPage() {
  const { data: quotes, isLoading } = useQuotes();
  const navigate = useNavigate();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(quotes, {
    searchFields: ["quote_number", "customer_name"],
    statusField: "status",
  });

  const { page, setPage, totalPages, paginatedItems } = usePagination(filtered);

  return (
    <ListPageLayout
      title="Cotizaciones"
      subtitle="Crea y administra cotizaciones para clientes"
      actions={<Button onClick={() => navigate("/quotes/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" />Nueva Cotización</Button>}
      filters={
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar cotizaciones..." className="max-w-xs" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
      isLoading={isLoading}
      items={paginatedItems}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      emptyMessage="No hay cotizaciones aún"
      tableHeader={
        <TableRow>
          <TableHead>Cotización #</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Fechas</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Válida Hasta</TableHead>
        </TableRow>
      }
      renderRow={(q) => (
        <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/quotes/${q.id}`)}>
          <TableCell className="font-mono font-medium">{q.quote_number}</TableCell>
          <TableCell>{q.customer_name || "—"}</TableCell>
          <TableCell className="text-sm">{q.start_date} → {q.end_date}</TableCell>
          <TableCell className="font-mono">{formatCurrency(q.total)}</TableCell>
          <TableCell><StatusBadge status={q.status} /></TableCell>
          <TableCell>{q.valid_until || "—"}</TableCell>
        </TableRow>
      )}
    />
  );
}
