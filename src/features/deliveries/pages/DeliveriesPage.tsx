import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useForkliftMap } from "@/features/fleet/hooks/forklifts/useForkliftMap";
import { useDeliveries } from "@/features/deliveries/hooks/useDeliveries";
import { ListPageLayout } from "@/components/ListPageLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateDisplay } from "@/lib/utils";
import { DeliveryFormDialog } from "@/features/deliveries/components/deliveries/DeliveryFormDialog";
import { useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

type Delivery = NonNullable<ReturnType<typeof useDeliveries>["data"]>[number];

export default function DeliveriesPage() {
  const navigate = useNavigate();
  const { forkliftMap } = useForkliftMap();
  const { data: deliveries, isLoading } = useDeliveries();

  const columns = useMemo<ColumnDef<Delivery>[]>(
    () => [
      {
        id: "delivery_number",
        header: "Entrega #",
        accessorKey: "delivery_number",
        cell: ({ row }) => <span className="font-mono text-sm text-primary">{row.original.delivery_number}</span>,
      },
      {
        id: "scheduled_date",
        header: "Fecha",
        accessorKey: "scheduled_date",
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {formatDateDisplay(row.original.scheduled_date)}
            {row.original.scheduled_time ? ` ${row.original.scheduled_time}` : ""}
          </span>
        ),
      },
      {
        id: "forklift_name",
        header: "Montacargas",
        accessorFn: (d) => forkliftMap.get(d.forklift_id)?.name || "",
        cell: ({ row }) => <span className="font-medium">{forkliftMap.get(row.original.forklift_id)?.name || "—"}</span>,
      },
      {
        id: "driver_name",
        header: "Operador",
        accessorFn: (d) => d.driver_name || "",
        cell: ({ row }) => row.original.driver_name || "—",
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [forkliftMap],
  );

  const table = useLiftgoTable<Delivery>({
    data: deliveries ?? [],
    columns,
    getRowId: (d) => d.id,
  });

  return (
    <ListPageLayout
      title="Entregas"
      subtitle="Programa y rastrea el transporte de equipos"
      actions={<DeliveryFormDialog />}
      isLoading={isLoading}
      table={table}
      onRowClick={(d) => navigate(`/deliveries/${d.id}`)}
      emptyMessage="No hay entregas programadas"
      mobileCardRender={(d) => (
        <Card className="cursor-pointer" onClick={() => navigate(`/deliveries/${d.id}`)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-muted-foreground">{d.delivery_number}</span>
              <StatusBadge status={d.status} />
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{d.type === "delivery" ? "Entrega" : "Recolección"}</span>
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</p>
            {d.address && <p className="text-xs text-muted-foreground truncate">{d.address}</p>}
            {d.driver_name && <p className="text-xs text-muted-foreground">Operador: {d.driver_name}</p>}
          </CardContent>
        </Card>
      )}
    />
  );
}
