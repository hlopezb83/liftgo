import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortalBookings } from "@/features/customers/hooks/customers/useCustomerPortal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateDisplay } from "@/lib/utils";
import {
  DataTableV2,
  useLiftgoTable,
  toColumnDefs,
  type LegacyColumn,
} from "@/components/dataTable/v2";

type Booking = NonNullable<ReturnType<typeof usePortalBookings>["data"]>[number];

export default function PortalRentals() {
  const { data: bookings, isLoading } = usePortalBookings();

  const columns = useMemo(
    () =>
      toColumnDefs<Booking>([
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
      ] satisfies LegacyColumn<Booking>[]),
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
