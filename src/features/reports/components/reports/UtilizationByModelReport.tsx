// arch:excepción §19 (tabla densa de reporte)
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { differenceInDays, parseISO, max, min } from "date-fns";
import { Download } from "lucide-react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface Props {
  startDate: Date;
  endDate: Date;
}

interface ModelRow {
  model: string;
  units: number;
  available: number;
  rented: number;
  bookedDays: number;
  totalDays: number;
  utilization: number;
}

const EXCLUDED_STATUSES = ["sold", "retired", "vendido", "retirado"];

function getUtilColor(pct: number) {
  if (pct > 75) return "hsl(var(--status-available))";
  if (pct >= 40) return "hsl(var(--status-warning))";
  return "hsl(var(--status-overdue))";
}

export function UtilizationByModelReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();
  const data = useMemo<ModelRow[]>(() => {
    const rangeDays = Math.max(differenceInDays(endDate, startDate), 1);
    const active = forklifts.filter(
      (f) => !EXCLUDED_STATUSES.includes(f.status?.toLowerCase() ?? "")
    );
    const groups = new Map<string, Tables<"forklifts">[]>();
    for (const f of active) {
      const key = f.manufacturer ? `${f.manufacturer} ${f.model}` : f.name;
      const arr = groups.get(key) ?? [];
      arr.push(f);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .map(([model, units]) => {
        const ids = new Set(units.map((u) => u.id));
        const available = units.filter((u) => u.status === "available").length;
        const rented = units.filter((u) => u.status === "rented").length;
        const relevantBookings = bookings.filter(
          (b) => ids.has(b.forklift_id) && b.status !== "cancelled"
        );
        let bookedDays = 0;
        for (const b of relevantBookings) {
          const bStart = max([parseISO(b.start_date), startDate]);
          const bEnd = min([parseISO(b.end_date), endDate]);
          const overlap = differenceInDays(bEnd, bStart) + 1;
          if (overlap > 0) bookedDays += overlap;
        }
        const totalDays = units.length * rangeDays;
        const utilization = totalDays > 0 ? Math.min(Math.round((bookedDays / totalDays) * 100), 100) : 0;
        return { model, units: units.length, available, rented, bookedDays, totalDays, utilization };
      });
  }, [forklifts, bookings, startDate, endDate]);

  const columns = useMemo<ColumnDef<ModelRow>[]>(
    () => [
      { id: "model", header: "Modelo", accessorKey: "model", cell: ({ row }) => <span className="font-medium">{row.original.model}</span> },
      { id: "units", header: "Unidades", accessorKey: "units", meta: { align: "right" }, cell: ({ row }) => row.original.units },
      { id: "available", header: "Disponibles", accessorKey: "available", meta: { align: "right" }, cell: ({ row }) => row.original.available },
      { id: "rented", header: "Rentados", accessorKey: "rented", meta: { align: "right" }, cell: ({ row }) => row.original.rented },
      { id: "bookedDays", header: "Días Reservados", accessorKey: "bookedDays", meta: { align: "right" }, cell: ({ row }) => row.original.bookedDays },
      { id: "totalDays", header: "Días Totales", accessorKey: "totalDays", meta: { align: "right" }, cell: ({ row }) => row.original.totalDays },
      {
        id: "utilization",
        header: "Utilización",
        accessorKey: "utilization",
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-mono" style={{ color: getUtilColor(row.original.utilization) }}>
            {row.original.utilization}%
          </span>
        ),
      },
    ],
    [],
  );

  const table = useLiftgoTable<ModelRow>({
    data,
    columns,
    getRowId: (r) => r.model,
    initialSorting: [{ id: "utilization", desc: true }],
    paginated: false,
  });

  const chartData = useMemo(
    () => [...data].sort((a, b) => b.utilization - a.utilization),
    [data],
  );

  const handleExport = () => {
    exportToCsv("reporte-utilizacion-modelo.csv", chartData.map((r) => ({
      Modelo: r.model,
      Unidades: r.units,
      Disponibles: r.available,
      Rentados: r.rented,
      "Días Reservados": r.bookedDays,
      "Días Totales": r.totalDays,
      "Utilización %": r.utilization,
    })));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Utilización por Modelo</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}%`} />
                <Bar dataKey="utilization" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.model} fill={getUtilColor(entry.utilization)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="No hay equipos activos para mostrar" />
        </CardContent>
      </Card>
    </>
  );
}
