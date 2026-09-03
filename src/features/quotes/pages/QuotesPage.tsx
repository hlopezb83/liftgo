import { useLiftgoTable } from "@/components/dataTable/v2";
import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { AddIcon, PlusCircle, ChevronRightIcon, DocumentIcon } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import { usePageActions } from "@/contexts/pageActions";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { RoleGuard } from "@/layouts/RoleGuard";
import { STATUS_LABELS } from "@/lib/constants";
import { toYMD } from "@/lib/date/toYMD";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { visibleListRows } from "@/lib/supabase/constants";
import { formatDateRange, nowMty, parseDateLocal } from "@/lib/utils";
import { QUOTE_STATUS_TAB_LABELS, quoteStatusLabel as quoteLabel } from "../constants";
import { isPublicoGeneral } from "../hooks/quoteDetail/useQuoteDetailData";
import { useQuotes, quoteQueries } from "../hooks/quotes/useQuotes";
import { buildQuotesColumns } from "./quotesColumns";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "converted", "rejected", "expired", "cancelled"] as const;
type QuoteStatus = (typeof QUOTE_STATUSES)[number];
// Bug 8: pestañas-filtro con labels plurales (conjuntos), no el singular del badge.
const QUOTE_STATUS_OPTIONS = [
  { value: "all" as const, label: QUOTE_STATUS_TAB_LABELS.all },
  ...QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_TAB_LABELS[s] ?? s })),
];

type Quote = NonNullable<ReturnType<typeof useQuotes>["data"]>[number];

export default function QuotesPage() {
  const { data: quotesRaw, isLoading, isError, refetch } = useQuotes();
  const quotes = visibleListRows(quotesRaw);
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

  const table = useLiftgoTable<Quote>({
    data: filtered,
    columns: buildQuotesColumns<Quote>(),
    getRowId: (q) => q.id,
  });

  return (
    <ListPageLayout
      onRefresh={refetch}
      title="Cotizaciones"
      subtitle="Crea y administra cotizaciones para clientes"
      actions={
        <RoleGuard module="Cotizaciones" minAccess="full" fallback={null}>
          <Button onClick={() => navigate("/quotes/new")} size="sm"><AddIcon className="h-4 w-4 mr-1" />Nueva cotización</Button>
        </RoleGuard>
      }
      mobileFab={
        <RoleGuard module="Cotizaciones" minAccess="full" fallback={null}>
          {/* R7-FE-07f (N7-UX-10): FAB extendido con texto — a 698px el "+" solo
              con icono obligaba a adivinar la acción primaria. */}
          <Button onClick={() => navigate("/quotes/new")} className="h-14 rounded-full shadow-lg px-5" aria-label="Nueva cotización">
            <PlusCircle className="h-6 w-6 mr-2" /> Nueva cotización
          </Button>
        </RoleGuard>
      }
      notice={
        <ListTruncationNotice rows={quotesRaw} />
      }
      filters={
        <div className="space-y-3">
          <FiltersToolbar>
            <FiltersToolbar.Search
              value={values.q}
              onChange={(v) => set("q", v)}
              placeholder="Buscar cotizaciones…"
            />
            <FiltersToolbar.StatusTabs
              value={values.status}
              onChange={(v) => set("status", v as QuoteStatus | "all")}
              options={QUOTE_STATUS_OPTIONS}
            />

            <FiltersToolbar.ClearAll visible={hasActive} onClick={reset} />
          </FiltersToolbar>
        </div>
      }

      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(q) => navigate(`/quotes/${q.id}`)}
      onRowPrefetch={(q) => quoteQueries.detail(q.id)}
      hasActiveFilters={hasActive}
      onClearFilters={reset}
      emptyIcon={DocumentIcon}
      emptyMessage="No hay cotizaciones aún"
      emptyActionLabel="Nueva cotización"
      onEmptyAction={() => navigate("/quotes/new")}
      skeletonColumns={7}
      mobileCardRender={(q) => {
        // R7 Bloque 19b: reutilizamos el cálculo de vencida en la vista móvil.
        const validUntil = q.valid_until ? parseDateLocal(q.valid_until) : null;
        // FIX B4: `new Date()` usaba el reloj/TZ del navegador; con un equipo mal
        // configurado la cotización se veía vencida un día antes. `nowMty()` fija
        // el "hoy" del negocio (America/Monterrey).
        const today = parseDateLocal(toYMD(nowMty()));
        const isExpired = q.status === "sent" && !!validUntil && !!today && validUntil.getTime() < today.getTime();
        return (
          <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate(`/quotes/${q.id}`)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Untranslated className="font-mono font-semibold text-sm">{q.quote_number}</Untranslated>
                  <Badge variant={q.quote_type === "sale" ? "default" : "secondary"} className="text-3xs px-1.5 py-0">
                    {STATUS_LABELS[q.quote_type || "rental"] || "Renta"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={q.status} label={quoteLabel(q.status)} />
                  {/* R14-FE-02/06: mismo lenguaje de badge (punto) que el resto de estados. */}
            {isExpired && <StatusBadge status="expired" label="Vencida" />}
                </div>
              </div>
              <p className={`text-sm ${q.customer_name && isPublicoGeneral(q.customer_name) ? "text-muted-foreground italic" : "text-muted-foreground"}`}>{q.customer_name ? <Untranslated>{q.customer_name}</Untranslated> : "Sin cliente"}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{formatDateRange(q.start_date, q.end_date)}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(q.total)}</span>
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
