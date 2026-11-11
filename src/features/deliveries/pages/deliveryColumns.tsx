import type { ColumnDef } from "@/components/dataTable/v2";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Untranslated } from "@/components/ui/Untranslated";
import { formatDateMty } from "@/lib/format/dateFormats";
import { deliveryOverdueDays, deliveryOverdueLabel } from "../lib/deliveryOverdue";
import { deliveryTypeLabel } from "../lib/deliveryTypeLabel";
import { isHistoricallyReconciled } from "../lib/historicalReconciliation";
import { resolveDeliveryForkliftName } from "../lib/resolveDeliveryForkliftName";
import type { DeliveryCardItem } from "../components/deliveries/DeliveryMobileCard";

export function buildDeliveryColumns<T extends DeliveryCardItem>(forkliftMap: Map<string, { name?: string | null }>, today?: string): ColumnDef<T>[] {
  return [
    {
      id: "delivery_number",
      header: "Entrega #",
      accessorKey: "delivery_number",
      cell: ({ row }) => <Untranslated className="font-mono text-sm text-primary">{row.original.delivery_number}</Untranslated>,
    },
    {
      // C2: el tipo (entrega vs recolección) sólo existía en la tarjeta móvil.
      id: "type",
      header: "Tipo",
      accessorFn: (d) => deliveryTypeLabel(d.type),
      cell: ({ row }) => <span className="text-sm">{deliveryTypeLabel(row.original.type)}</span>,
    },
    {
      id: "scheduled_date",
      header: "Fecha",
      accessorKey: "scheduled_date",
      cell: ({ row }) => {
        const overdue = deliveryOverdueDays(row.original, today);
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">
              {formatDateMty(row.original.scheduled_date)}
              {row.original.scheduled_time ? ` ${row.original.scheduled_time}` : ""}
            </span>
            {overdue > 0 && (
              <Badge variant="destructive" className="text-3xs px-1.5 py-0">{deliveryOverdueLabel(overdue)}</Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "forklift_name",
      header: "Montacargas",
      // R9-P2: la lista de montacargas puede venir filtrada/paginada, así que
      // el mapa a veces no tenía la unidad y la celda quedaba en "—". La
      // consulta de entregas ya trae el join `forklifts(name, model)`: se usa
      // como fuente primaria y el mapa sólo como respaldo.
      accessorFn: (d) => resolveDeliveryForkliftName(d, forkliftMap) ?? "",
      cell: ({ row }) => {
        const name = resolveDeliveryForkliftName(row.original, forkliftMap);
        return name ? <Untranslated className="font-medium">{name}</Untranslated> : <span className="font-medium">—</span>;
      },
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
      cell: ({ row }) => <div className="flex flex-wrap gap-1"><StatusBadge status={row.original.status} />{isHistoricallyReconciled(row.original) && <Badge variant="secondary">Conciliada históricamente</Badge>}</div>,
    },
  ];
}
