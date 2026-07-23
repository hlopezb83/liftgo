import { differenceInCalendarDays } from "date-fns";

import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useBookings, type BookingWithForklift } from "@/features/bookings";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { nowMty, parseDateLocal } from "@/lib/utils";

/**
 * /returns/pending — Montacargas cuya reserva ya terminó y siguen sin regresar
 * al almacén (sin `return_inspection` registrada). Fuente única de verdad para
 * las alertas de "Rentas Vencidas" del dashboard.
 */
export default function PendingReturnsPage() {
  const navigate = useNavigateTransition();
  const { data: bookings, isLoading, isError, refetch } = useBookings();

  const today = nowMty();
  today.setHours(23, 59, 59, 999);

  const pending = (bookings ?? []).filter(
    (b) =>
      b.status === "confirmed" &&
      !b.return_status &&
      parseDateLocal(b.end_date) <= today,
  );

  const columns: ColumnDef<BookingWithForklift>[] = [
    {
      id: "booking_number",
      header: "Reserva",
      accessorKey: "booking_number",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-primary">{row.original.booking_number}</span>
      ),
    },
    {
      id: "forklift_name",
      header: "Montacargas",
      accessorFn: (b) => b.forklifts?.name ?? "",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.forklifts?.name ?? "—"}</span>
      ),
    },
    {
      id: "customer_name",
      header: "Cliente",
      accessorKey: "customer_name",
    },
    {
      id: "end_date",
      header: "Fin de renta",
      accessorKey: "end_date",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatDate(row.original.end_date)}</span>
      ),
    },
    {
      id: "days_overdue",
      header: "Días vencido",
      accessorFn: (b) => differenceInCalendarDays(today, parseDateLocal(b.end_date)),
      cell: ({ row }) => {
        const days = differenceInCalendarDays(today, parseDateLocal(row.original.end_date));
        return (
          <Badge variant={days > 7 ? "destructive" : "secondary"} className="font-mono">
            {days} {days === 1 ? "día" : "días"}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/returns?booking_id=${row.original.id}`);
          }}
        >
          <PlusCircle className="h-4 w-4 mr-1" /> Registrar devolución
        </Button>
      ),
    },
  ];

  const table = useLiftgoTable<BookingWithForklift>({
    data: pending,
    columns,
    getRowId: (b) => b.id,
  });

  return (
    <ListPageLayout
      title="Retornos Pendientes"
      subtitle="Montacargas con reserva vencida que siguen sin regresar al almacén"
      totalCount={pending.length}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(b) => navigate(`/bookings/${b.id}`)}
      emptyMessage="No hay retornos pendientes — toda la flota rentada está al corriente"
      mobileCardRender={(b) => {
        const days = differenceInCalendarDays(today, parseDateLocal(b.end_date));
        return (
          <Card className="cursor-pointer" onClick={() => navigate(`/bookings/${b.id}`)}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">{b.booking_number}</span>
                <Badge variant={days > 7 ? "destructive" : "secondary"} className="font-mono text-[10px]">
                  {days} {days === 1 ? "día" : "días"}
                </Badge>
              </div>
              <p className="text-sm font-semibold">{b.forklifts?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{b.customer_name}</p>
              <p className="text-xs font-mono text-muted-foreground">
                Fin: {formatDate(b.end_date)}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/returns?booking_id=${b.id}`);
                }}
              >
                <PlusCircle className="h-4 w-4 mr-1" /> Registrar devolución
              </Button>
            </CardContent>
          </Card>
        );
      }}
    />
  );
}
