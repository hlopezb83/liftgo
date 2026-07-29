import type { ColumnDef } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import type { EnrichedMaintenanceLog } from "../lib/maintenancePageHelpers";

export const maintenanceColumns: ColumnDef<EnrichedMaintenanceLog>[] = [
  {
    id: "performed_at",
    header: "Fecha",
    accessorKey: "performed_at",
    cell: ({ row }) => <span className="font-mono text-sm">{formatDateDisplay(row.original.performed_at)}</span>,
  },
  {
    id: "forklift_name",
    header: "Montacargas",
    accessorKey: "forklift_name",
    cell: ({ row }) => <span className="font-medium">{row.original.forklift_name || "—"}</span>,
  },
  {
    id: "service_type",
    header: "Tipo de Servicio",
    accessorKey: "service_type",
  },
  {
    id: "performed_by",
    header: "Realizado Por",
    accessorFn: (l) => l.performed_by ?? "",
    cell: ({ row }) => row.original.performed_by || "—",
  },
  {
    id: "cost",
    header: "Costo",
    accessorFn: (l) => l.cost ?? 0,
    meta: { kind: "money" },
    cell: ({ row }) => <span>{formatCurrency(row.original.cost || 0)}</span>,
  },
  {
    id: "next_service_date",
    header: "Próximo Servicio",
    accessorFn: (l) => l.next_service_date ?? "",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDateDisplay(row.original.next_service_date)}</span>
    ),
  },
];
