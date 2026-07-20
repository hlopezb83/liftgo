import type { ColumnDef } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import type { ModelRow } from "../../../hooks/useProfitByModelReport";

export const profitabilityColumns: ColumnDef<ModelRow>[] = [
  { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => <span className="font-medium">{row.original.model}</span> },
  { id: "units", header: "Unidades", accessorKey: "units", meta: { align: "right" }, cell: ({ row }) => row.original.units },
  { id: "revenue", header: "Ingresos", accessorKey: "revenue", meta: { align: "right" }, cell: ({ row }) => formatCurrency(row.original.revenue) },
  { id: "maintenance", header: "Mantenimiento", accessorKey: "maintenance", meta: { align: "right" }, cell: ({ row }) => formatCurrency(row.original.maintenance) },
  { id: "damages", header: "Daños", accessorKey: "damages", meta: { align: "right" }, cell: ({ row }) => formatCurrency(row.original.damages) },
  {
    id: "profit",
    header: "Ganancia Neta",
    accessorKey: "profit",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className={cn("font-semibold", row.original.profit >= 0 ? "text-chart-2" : "text-destructive")}>
        {formatCurrency(row.original.profit)}
      </span>
    ),
  },
  { id: "margin", header: "Margen %", accessorKey: "margin", meta: { align: "right" }, cell: ({ row }) => `${row.original.margin.toFixed(1)}%` },
];
