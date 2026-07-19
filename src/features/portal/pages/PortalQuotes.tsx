
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { usePortalQuotes } from "../hooks/usePortalExtras";

type Quote = NonNullable<ReturnType<typeof usePortalQuotes>["data"]>[number];

export default function PortalQuotes() {
  const { data, isLoading } = usePortalQuotes();
  const navigate = useNavigateTransition();
  const isMobile = useIsMobile();

  const columns: ColumnDef<Quote>[] = [
    { id: "quote_number", header: "Cotización #", accessorKey: "quote_number",
      cell: ({ row }) => <span className="font-medium">{row.original.quote_number}</span> },
    { id: "created_at", header: "Fecha", accessorKey: "created_at",
      cell: ({ row }) => formatDateDisplay(row.original.created_at) },
    { id: "valid_until", header: "Válida hasta", accessorKey: "valid_until",
      cell: ({ row }) => row.original.valid_until ? formatDateDisplay(row.original.valid_until) : "—" },
    { id: "total", header: "Total", accessorFn: (q) => Number(q.total), meta: { align: "right" },
      cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.total))}</span> },
    { id: "status", header: "Estado", accessorKey: "status",
      cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  const table = useLiftgoTable<Quote>({
    data, columns, getRowId: (q) => q.id,
    initialSorting: [{ id: "created_at", desc: true }],
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Cotizaciones" />
      <Card>
        <CardHeader><CardTitle className="text-base">Todas las cotizaciones</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="p-3">
              <MobileCardList
                items={data ?? []}
                keyExtractor={(q) => q.id}
                emptyMessage="No hay cotizaciones para mostrar"
                renderCard={(q) => (
                  <Card
                    className="cursor-pointer active:bg-accent/40"
                    onClick={() => navigate(`/portal/quotes/${q.id}`)}
                  >
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{q.quote_number}</span>
                        <StatusBadge status={q.status} />
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatDateDisplay(q.created_at)}</span>
                        <span className="font-mono font-semibold text-foreground">
                          {formatCurrency(Number(q.total))}
                        </span>
                      </div>
                      {q.valid_until ? (
                        <div className="text-xs text-muted-foreground">
                          Válida hasta: {formatDateDisplay(q.valid_until)}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <DataTableV2
              table={table}
              emptyMessage="No hay cotizaciones para mostrar"
              onRowClick={(q) => navigate(`/portal/quotes/${q.id}`)}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
