import { useQuotes } from "@/hooks/useQuotes";
import { useNavigate } from "react-router-dom";
import { useListFilters } from "@/hooks/useListFilters";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { STATUS_LABELS } from "@/lib/constants";
import { PlusCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateDisplay } from "@/lib/utils";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"];
const QUOTE_STATUS_LABELS: Record<string, string> = { ...STATUS_LABELS, sent: "Enviada" };
const quoteLabel = (status: string) => QUOTE_STATUS_LABELS[status] || status;

export default function QuotesPage() {
  const { data: quotes, isLoading } = useQuotes();
  const navigate = useNavigate();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(quotes, {
    searchFields: ["quote_number", "customer_name"],
    statusField: "status",
  });

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(filtered, {
    accessors: {
      quote_number: (q) => q.quote_number,
      customer_name: (q) => q.customer_name || "",
      total: (q) => q.total,
      status: (q) => q.status,
      valid_until: (q) => q.valid_until || "",
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(q) => q.id}
      emptyMessage="No hay cotizaciones aún"
      renderCard={(q) => (
        <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/quotes/${q.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-semibold text-sm">{q.quote_number}</span>
                <Badge variant={q.quote_type === "sale" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                  {STATUS_LABELS[q.quote_type || "rental"] || "Renta"}
                </Badge>
              </div>
              <StatusBadge status={q.status} label={quoteLabel(q.status)} />
            </div>
            <p className="text-sm text-muted-foreground">{q.customer_name || "Sin cliente"}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">{formatDateDisplay(q.start_date)} → {formatDateDisplay(q.end_date)}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold font-mono">{formatCurrency(q.total)}</span>
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
      title="Cotizaciones"
      subtitle="Crea y administra cotizaciones para clientes"
      actions={<Button onClick={() => navigate("/quotes/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" />Nueva Cotización</Button>}
      filters={
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar cotizaciones..." className="max-w-xs" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABELS[s] || s}</SelectItem>)}
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
          <SortableTableHead sortKey="quote_number" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cotización #</SortableTableHead>
          <TableHead>Tipo</TableHead>
          <SortableTableHead sortKey="customer_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Cliente</SortableTableHead>
          <TableHead>Fechas</TableHead>
          <SortableTableHead sortKey="total" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Total</SortableTableHead>
          <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
          <SortableTableHead sortKey="valid_until" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Válida Hasta</SortableTableHead>
        </TableRow>
      }
      renderRow={(q) => (
        <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors" onClick={() => navigate(`/quotes/${q.id}`)}>
          <TableCell className="font-mono font-medium">{q.quote_number}</TableCell>
          <TableCell>
            <Badge variant={q.quote_type === "sale" ? "default" : "secondary"} className="text-xs">
              {STATUS_LABELS[q.quote_type || "rental"] || "Renta"}
            </Badge>
          </TableCell>
          <TableCell>{q.customer_name || "—"}</TableCell>
          <TableCell className="text-sm">{formatDateDisplay(q.start_date)} → {formatDateDisplay(q.end_date)}</TableCell>
          <TableCell className="font-mono">{formatCurrency(q.total)}</TableCell>
          <TableCell><StatusBadge status={q.status} /></TableCell>
          <TableCell>{formatDateDisplay(q.valid_until)}</TableCell>
        </TableRow>
      )}
      customContent={mobileContent}
      skeletonColumns={7}
    />
  );
}
