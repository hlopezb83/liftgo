import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { formatDateDisplay } from "@/lib/utils";
import type { ForkliftFinancials } from "@/features/fleet/hooks/forklifts/useForkliftFinancials";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface ForkliftHourometerHistoryProps {
  history: ForkliftFinancials["hourometer_history"];
}

type Entry = ForkliftFinancials["hourometer_history"][number];

export function ForkliftHourometerHistory({ history }: ForkliftHourometerHistoryProps) {
  const columns = useMemo<ColumnDef<Entry>[]>(
    () => [
      {
        id: "date",
        header: "Fecha",
        accessorKey: "date",
        cell: ({ row }) => <span className="text-sm">{formatDateDisplay(row.original.date)}</span>,
      },
      {
        id: "delivery_number",
        header: "Entrega",
        accessorKey: "delivery_number",
        cell: ({ row }) => <span className="text-sm font-mono">{row.original.delivery_number}</span>,
      },
      {
        id: "type",
        header: "Tipo",
        accessorKey: "type",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.type === "delivery" ? "Entrega" : "Recolección"}</span>
        ),
      },
      {
        id: "hours_reading",
        header: "Lectura (hrs)",
        accessorKey: "hours_reading",
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.hours_reading}</span>,
      },
    ],
    [],
  );

  const table = useLiftgoTable<Entry>({
    data: history,
    columns,
    getRowId: (e) => e.delivery_id,
    initialSorting: [{ id: "date", desc: true }],
    paginated: false,
  });

  if (!history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Historial de Horómetro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTableV2 table={table} emptyMessage="Sin lecturas de horómetro" />
      </CardContent>
    </Card>
  );
}
