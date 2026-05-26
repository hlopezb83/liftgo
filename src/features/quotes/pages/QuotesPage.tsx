import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useQuotes } from "@/features/quotes/hooks/quotes/useQuotes";
import { useListFilters } from "@/hooks/useListFilters";
import { ListPageLayout } from "@/components/ListPageLayout";
import { SearchBar } from "@/components/SearchBar";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/constants";
import { PlusCircle, ChevronRight } from "lucide-react";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

const STATUSES = ["all", "draft", "sent", "accepted", "declined", "expired"];
const QUOTE_STATUS_LABELS: Record<string, string> = { ...STATUS_LABELS, sent: "Enviada" };
const quoteLabel = (status: string) => QUOTE_STATUS_LABELS[status] || status;

type Quote = NonNullable<ReturnType<typeof useQuotes>["data"]>[number];

export default function QuotesPage() {
  const { data: quotes, isLoading, refetch } = useQuotes();
  const navigate = useNavigate();

  const { search, setSearch, statusFilter, setStatusFilter, filtered } = useListFilters(quotes, {
    searchFields: ["quote_number", "customer_name"],
    statusField: "status",
  });

  const columns = useMemo<ColumnDef<Quote>[]>(
    () => [
      {
        id: "quote_number",
        header: "Cotización #",
        accessorKey: "quote_number",
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.quote_number}</span>,
      },
      {
        id: "type",
        header: "Tipo",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.quote_type === "sale" ? "default" : "secondary"} className="text-xs">
            {STATUS_LABELS[row.original.quote_type || "rental"] || "Renta"}
          </Badge>
        ),
      },
      {
        id: "customer_name",
        header: "Cliente",
        accessorFn: (q) => q.customer_name || "",
        cell: ({ row }) => row.original.customer_name || "—",
      },
      {
        id: "dates",
        header: "Fechas",
        enableSorting: false,
        cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDateRange(row.original.start_date, row.original.end_date)}</span>,
      },
      {
        id: "total",
        header: "Total",
        accessorKey: "total",
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} label={quoteLabel(row.original.status)} />,
      },
      {
        id: "valid_until",
        header: "Vigencia",
        accessorFn: (q) => q.valid_until || "",
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDateDisplay(row.original.valid_until)}</span>,
      },
    ],
    [],
  );

  const table = useLiftgoTable<Quote>({
    data: filtered,
    columns,
    getRowId: (q) => q.id,
  });

  return (
    <ListPageLayout
      onRefresh={refetch}
      title="Cotizaciones"
      subtitle="Crea y administra cotizaciones para clientes"
      actions={<Button onClick={() => navigate("/quotes/new")} size="sm"><PlusCircle className="h-4 w-4 mr-1" />Nueva Cotización</Button>}
      mobileFab={
        <Button onClick={() => navigate("/quotes/new")} size="icon" className="h-14 w-14 rounded-full shadow-lg" aria-label="Nueva cotización">
          <PlusCircle className="h-6 w-6" />
        </Button>
      }
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
      table={table}
      onRowClick={(q) => navigate(`/quotes/${q.id}`)}
      emptyMessage="No hay cotizaciones aún"
      skeletonColumns={7}
      mobileCardRender={(q) => (
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
              <span className="text-xs text-muted-foreground">{formatDateRange(q.start_date, q.end_date)}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold font-mono">{formatCurrency(q.total)}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
