import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { parseISO, isWithinInterval } from "date-fns";
import { Download } from "@/components/icons";
import { useForklifts } from "@/features/fleet";
import { useMaintenanceLogs } from "@/features/maintenance";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { name: string; totalCost: number; count: number };

export function MaintenanceCostReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const forkliftMap = useMemo(() => new Map(forklifts.map((f) => [f.id, f.name])), [forklifts]);

  const data = useMemo<Row[]>(() => {
    const filtered = maintenanceLogs.filter((m) => isWithinInterval(parseISO(m.performed_at), { start: startDate, end: endDate }));
    const byForklift: Record<string, Row> = {};
    filtered.forEach((m) => {
      const name = forkliftMap.get(m.forklift_id) || "Desconocido";
      if (!byForklift[m.forklift_id]) byForklift[m.forklift_id] = { name, totalCost: 0, count: 0 };
      byForklift[m.forklift_id].totalCost += Number(m.cost || 0);
      byForklift[m.forklift_id].count++;
    });
    return Object.values(byForklift);
  }, [maintenanceLogs, startDate, endDate, forkliftMap]);

  const chartData = useMemo(() => [...data].sort((a, b) => b.totalCost - a.totalCost), [data]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: "count", header: "Trabajos", accessorKey: "count", meta: { align: "right" }, cell: ({ row }) => row.original.count },
      { id: "totalCost", header: "Costo Total", accessorKey: "totalCost", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.totalCost)}</span> },
    ],
    [],
  );

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.name,
    initialSorting: [{ id: "totalCost", desc: true }],
    paginated: false,
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Costos de Mantenimiento por Unidad</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("costos-mantenimiento.csv", chartData)}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(val) => formatCurrency(Number(val))} />
                <Bar dataKey="totalCost" fill="hsl(var(--chart-4))" name="Costo" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="Sin mantenimientos en el rango" />
        </CardContent>
      </Card>
    </>
  );
}
