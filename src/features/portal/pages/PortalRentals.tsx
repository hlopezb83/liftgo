import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortalBookings } from "@/features/customers";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateDisplay } from "@/lib/utils";

type Booking = NonNullable<ReturnType<typeof usePortalBookings>["data"]>[number];

export default function PortalRentals() {
  const { data: bookings, isLoading, isError, refetch } = usePortalBookings();
  const isMobile = useIsMobile();

  const columns: ColumnDef<Booking>[] = [
      {
        id: "equipo",
        header: "Equipo",
        accessorFn: (b) => `${b.forklifts?.name ?? ""} ${b.forklifts?.model ?? ""}`.trim(),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.forklifts?.name || "—"} — {row.original.forklifts?.model || ""}
          </span>
        ),
      },
      {
        id: "start_date",
        header: "Fecha Inicio",
        accessorKey: "start_date",
        meta: { kind: "date" },
        cell: ({ row }) => formatDateDisplay(row.original.start_date),
      },
      {
        id: "end_date",
        header: "Fecha Fin",
        accessorKey: "end_date",
        meta: { kind: "date" },
        cell: ({ row }) => formatDateDisplay(row.original.end_date),
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        meta: { kind: "badge" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];

  const table = useLiftgoTable<Booking>({
    data: bookings,
    columns,
    getRowId: (b) => b.id,
    initialSorting: [{ id: "start_date", desc: true }],
    paginated: false,
  });

  if (isLoading) return <TableSkeleton rows={6} columnCount={5} />;

  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <PageHeader title="Mis Rentas" />
        <QueryErrorState entity="tus rentas" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader title="Mis Rentas" />
      <Card>
        <CardHeader><CardTitle className="text-base">Historial de Reservas</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="p-3">
              <MobileCardList
                items={bookings ?? []}
                keyExtractor={(b) => b.id}
                emptyMessage="Aún no tienes rentas. Cuando tengas una renta activa aparecerá aquí. ¿Necesitas un montacargas? Solicita una cotización con tu ejecutivo de cuenta."
                renderCard={(b) => (
                  <Card>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {b.forklifts?.name || "—"}
                          {b.forklifts?.model ? ` — ${b.forklifts.model}` : ""}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDateDisplay(b.start_date)} → {formatDateDisplay(b.end_date)}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
            </div>
          ) : (
            <DataTableV2 table={table} emptyMessage="Aún no tienes rentas. Cuando tengas una renta activa aparecerá aquí. ¿Necesitas un montacargas? Solicita una cotización con tu ejecutivo de cuenta." />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
