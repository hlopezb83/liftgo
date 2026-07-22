import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { AddIcon, PlusCircle, ChevronRightIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePageActions } from "@/contexts/pageActions";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { STATUS_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, formatDateRange, parseDateLocal } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";
import { QUOTE_STATUS_LABELS, quoteStatusLabel as quoteLabel } from "../constants";
import { isPublicoGeneral } from "../hooks/quoteDetail/useQuoteDetailData";
import { useQuotes, quoteQueries } from "../hooks/quotes/useQuotes";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
type QuoteStatus = (typeof QUOTE_STATUSES)[number];
const QUOTE_STATUS_OPTIONS = [
  { value: "all" as const, label: QUOTE_STATUS_LABELS.all ?? "Todos" },
  ...QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] ?? s })),
];

type Quote = NonNullable<ReturnType<typeof useQuotes>["data"]>[number];

export default function QuotesPage() {
  const { data: quotes, isLoading, isError, refetch } = useQuotes();
  const navigate = useNavigateTransition();
  usePageActions({ onNew: () => navigate("/quotes/new"), onRefresh: refetch, newLabel: "Nueva cotización" });

  const { values, set, reset, hasActive, filtered } = useTableFilters<Quote, {
    q: { type: "text"; fields: (keyof Quote)[] };
    status: { type: "enum"; field: keyof Quote; options: readonly (QuoteStatus | "all")[] };
  }>({
    items: quotes ?? [],
    facets: {
      q: { type: "text", fields: ["quote_number", "customer_name"] as (keyof Quote)[] },
      status: { type: "enum", field: "status", options: ["all", ...QUOTE_STATUSES] as const },
    },
  });


  const columns: ColumnDef<Quote>[] = [
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
        // v7.182: "Público en General" desaturado para reducir ruido cuando
        // domina la lista (patrón repetido en CFDI genéricos).
        cell: ({ row }) => {
          const name = row.original.customer_name;
          if (!name) return "—";
          if (isPublicoGeneral(name)) {
            return <span className="text-muted-foreground italic">{name}</span>;
          }
          return name;
        },
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
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total)}</span>,
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => {
          const q = row.original;
          // R7 Bloque 19b: badge "Vencida" para cotizaciones enviadas cuya vigencia pasó.
          const validUntil = q.valid_until ? parseDateLocal(q.valid_until) : null;
          const today = parseDateLocal(toYMD(new Date()));
          const isExpired = q.status === "sent" && !!validUntil && !!today && validUntil.getTime() < today.getTime();
          return (
            <div className="flex items-center gap-1.5">
              <StatusBadge status={q.status} label={quoteLabel(q.status)} />
              {isExpired && <Badge variant="destructive" className="text-3xs px-1.5 py-0">Vencida</Badge>}
            </div>
          );
        },
      },
      {
        id: "valid_until",
        header: "Vigencia",
        accessorFn: (q) => q.valid_until || "",
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDateDisplay(row.original.valid_until)}</span>,
      },
    ];

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
      actions={<Button onClick={() => navigate("/quotes/new")} size="sm"><AddIcon className="h-4 w-4 mr-1" />Nueva Cotización</Button>}
      mobileFab={
        <Button onClick={() => navigate("/quotes/new")} size="icon" className="h-14 w-14 rounded-full shadow-lg" aria-label="Nueva cotización">
          <PlusCircle className="h-6 w-6" />
        </Button>
      }
      filters={
        <FiltersToolbar>
          <FiltersToolbar.Search
            value={values.q}
            onChange={(v) => set("q", v)}
            placeholder="Buscar cotizaciones..."
          />
          <FiltersToolbar.StatusTabs
            value={values.status}
            onChange={(v) => set("status", v as QuoteStatus | "all")}
            options={QUOTE_STATUS_OPTIONS}
          />

          <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
        </FiltersToolbar>
      }

      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(q) => navigate(`/quotes/${q.id}`)}
      onRowPrefetch={(q) => quoteQueries.detail(q.id)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyMessage="No hay cotizaciones aún"
      skeletonColumns={7}
      mobileCardRender={(q) => {
        // R7 Bloque 19b: reutilizamos el cálculo de vencida en la vista móvil.
        const validUntil = q.valid_until ? parseDateLocal(q.valid_until) : null;
        const today = parseDateLocal(toYMD(new Date()));
        const isExpired = q.status === "sent" && !!validUntil && !!today && validUntil.getTime() < today.getTime();
        return (
          <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/quotes/${q.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold text-sm">{q.quote_number}</span>
                  <Badge variant={q.quote_type === "sale" ? "default" : "secondary"} className="text-3xs px-1.5 py-0">
                    {STATUS_LABELS[q.quote_type || "rental"] || "Renta"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={q.status} label={quoteLabel(q.status)} />
                  {isExpired && <Badge variant="destructive" className="text-3xs px-1.5 py-0">Vencida</Badge>}
                </div>
              </div>
              <p className={`text-sm ${q.customer_name && isPublicoGeneral(q.customer_name) ? "text-muted-foreground italic" : "text-muted-foreground"}`}>{q.customer_name || "Sin cliente"}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{formatDateRange(q.start_date, q.end_date)}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold font-mono">{formatCurrency(q.total)}</span>
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      }}
    />
  );
}
