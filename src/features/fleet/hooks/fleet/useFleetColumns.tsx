
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SecurityIcon } from "@/components/icons";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import type { ColumnDef } from "@/components/dataTable/v2";
import type { Forklift } from "../forklifts/useForklifts";

export function useFleetColumns(
  activePolicyForkliftIds: Set<string>,
  locationMap: Map<string, string>,
) {
  return [
      {
        id: "name",
        header: "ID",
        accessorKey: "name",
        cell: ({ row }) => {
          const f = row.original;
          return (
            <span className="font-mono font-medium flex items-center gap-1.5">
              {f.name}
              {activePolicyForkliftIds.has(f.id) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SecurityIcon className="h-3.5 w-3.5 text-success shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Póliza de mantenimiento activa</TooltipContent>
                </Tooltip>
              )}
            </span>
          );
        },
      },
      { id: "model", header: "Modelo", accessorKey: "model" },
      {
        id: "serial_number",
        header: "No. de Serie",
        accessorFn: (f) => f.serial_number || "",
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.serial_number || "—"}</span>,
      },
      {
        id: "fuel_type",
        header: "Combustible",
        accessorFn: (f) => f.fuel_type || "",
        cell: ({ row }) => (row.original.fuel_type ? (FUEL_TYPE_LABELS[row.original.fuel_type] || row.original.fuel_type) : "—"),
      },
      {
        id: "status",
        header: "Estado",
        accessorKey: "status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "location",
        header: "Ubicación",
        enableSorting: false,
        meta: { cellClassName: "hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate" },
        cell: ({ row }) => locationMap.get(row.original.id) || "—",
      },
    ];
}
