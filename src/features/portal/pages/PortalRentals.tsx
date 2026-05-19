import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalBookings } from "@/features/customers/hooks/customers/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

type Booking = NonNullable<ReturnType<typeof usePortalBookings>["data"]>[number];

export default function PortalRentals() {
  const { data: bookings, isLoading } = usePortalBookings();

  const columns = useMemo<ColumnDef<Booking>[]>(
    () => [
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
        cell: ({ row }) => formatDateDisplay(row.original.start_date),
      },
      {
        id: "end_date",
        header: "Fecha Fin",
        accessorKey: "end_date",
        cell: ({ row }) => formatDateDisplay(row.original.end_date),
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  const table = useLiftgoTable<Booking>({
    data: bookings,
    columns,
    getRowId: (b) => b.id,
    initialSorting: [{ id: "start_date", desc: true }],
    paginated: false,
  });

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Rentas</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Historial de Reservas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="No se encontraron rentas" />
        </CardContent>
      </Card>
    </div>
  );
}
