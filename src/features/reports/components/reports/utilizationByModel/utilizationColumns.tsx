import type { ColumnDef } from "@/components/dataTable/v2";
import { cn } from "@/lib/utils";
import { getUtilTextClass, type ModelRow } from "./utilizationHelpers";

export const utilizationColumns: ColumnDef<ModelRow>[] = [
  { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => <span className="font-medium">{row.original.model}</span> },
  { id: "units", header: "Unidades", accessorKey: "units", meta: { kind: "number" }, cell: ({ row }) => row.original.units },
  { id: "available", header: "Disponibles", accessorKey: "available", meta: { kind: "number" }, cell: ({ row }) => row.original.available },
  { id: "rented", header: "Rentados", accessorKey: "rented", meta: { kind: "number" }, cell: ({ row }) => row.original.rented },
  { id: "bookedDays", header: "Días Reservados", accessorKey: "bookedDays", meta: { kind: "number" }, cell: ({ row }) => row.original.bookedDays },
  { id: "totalDays", header: "Días Totales", accessorKey: "totalDays", meta: { kind: "number" }, cell: ({ row }) => row.original.totalDays },
  {
    id: "utilization",
    header: "Utilización",
    accessorKey: "utilization",
    meta: { kind: "number" },
    cell: ({ row }) => (
      <span className={cn("tabular-nums font-medium", getUtilTextClass(row.original.utilization))}>
        {row.original.utilization}%
      </span>
    ),
  },
];

