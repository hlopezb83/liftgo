import { differenceInCalendarDays } from "date-fns";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { PlusCircle } from "@/components/icons";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type BookingWithForklift } from "@/features/bookings";
import { useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { PendingReturnCard } from "../components/PendingReturnCard";
import { usePendingReturns } from "../hooks/usePendingReturns";

/**
 * /returns/pending — Reservas vencidas con entrega completada y devolución
 * pendiente. El dashboard aplica los mismos requisitos de elegibilidad.
 */
export default function PendingReturnsPage() {
  const canWrite = useHasModuleAccess("Entregas", "full");
  const navigate = useNavigateTransition();
  // Query dedicada server-side (estado, entrega y fechas filtrados en
  // PostgREST, orden end_date ASC): el listado genérico de useBookings está
  // truncado (LIMIT) y ordenado por start_date DESC, lo que hacía desaparecer
  // de esta página los retornos más vencidos.
  const { data: pendingReturns, isLoading, isError, refetch } = usePendingReturns();

  // Alineado con get_dashboard_stats(): fin < hoy (America/Monterrey).
  const today = nowMty();
  today.setHours(0, 0, 0, 0);

  const pending = pendingReturns ?? [];


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
        <span className="font-mono text-sm">{formatDateMty(row.original.end_date)}</span>
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
  ];

  if (canWrite) columns.push({
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
  });

  const table = useLiftgoTable<BookingWithForklift>({
    data: pending,
    columns,
    getRowId: (b) => b.id,
  });

  return (
    <ListPageLayout
      title="Retornos Pendientes"
      subtitle="Equipos entregados cuya reserva venció y esperan devolución"
      totalCount={pending.length}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => { void refetch(); }}
      table={table}
      onRowClick={(b) => navigate(`/bookings/${b.id}`)}
      emptyMessage="No hay devoluciones vencidas pendientes"
      emptyActionLabel={canWrite ? "Registrar devolución" : undefined}
      onEmptyAction={canWrite ? () => navigate("/returns") : undefined}
      mobileCardRender={(b) => {
        const days = differenceInCalendarDays(today, parseDateLocal(b.end_date));
        return <PendingReturnCard booking={b} daysOverdue={days} canWrite={canWrite} />;
      }}
    />
  );
}
