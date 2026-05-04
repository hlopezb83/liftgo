import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalBookings } from "@/hooks/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/DataTable";

type Booking = NonNullable<ReturnType<typeof usePortalBookings>["data"]>[number];

export default function PortalRentals() {
  const { data: bookings, isLoading } = usePortalBookings();

  if (isLoading) return <Skeleton className="h-96" />;

  const columns: DataTableColumn<Booking>[] = [
    {
      key: "equipo",
      label: "Equipo",
      sortable: true,
      accessor: (b) => `${b.forklifts?.name ?? ""} ${b.forklifts?.model ?? ""}`.trim(),
      render: (b) => <span className="font-medium">{b.forklifts?.name || "—"} — {b.forklifts?.model || ""}</span>,
    },
    { key: "start_date", label: "Fecha Inicio", sortable: true, render: (b) => formatDateDisplay(b.start_date) },
    { key: "end_date", label: "Fecha Fin", sortable: true, render: (b) => formatDateDisplay(b.end_date) },
    { key: "status", label: "Estado", sortable: true, render: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Mis Rentas</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Historial de Reservas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={bookings}
            keyExtractor={(b) => b.id}
            emptyMessage="No se encontraron rentas"
            defaultSortKey="start_date"
            defaultSortDirection="desc"
          />
        </CardContent>
      </Card>
    </div>
  );
}
