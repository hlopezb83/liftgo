
import { parseISO, isWithinInterval } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useForklifts } from "@/features/fleet";
import { useMaintenanceLogs } from "@/features/maintenance";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCompactCurrency, formatCurrency } from "@/lib/format/formatCurrency";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { name: string; totalCost: number; count: number };

export function MaintenanceCostReport({ startDate, endDate }: Props) {
  const { data: forklifts = [], isError: fError, isFetching: fFetching, refetch: fRefetch } = useForklifts();
  const { data: maintenanceLogs = [], isError: mError, refetch: mRefetch } = useMaintenanceLogs();
  const forkliftMap = new Map(forklifts.map((f) => [f.id, f.name]));

  const data: Row[] = (() => {
    const filtered = maintenanceLogs.filter((m) => isWithinInterval(parseISO(m.performed_at), { start: startDate, end: endDate }));
    const byForklift: Record<string, Row> = {};
    filtered.forEach((m) => {
      const name = forkliftMap.get(m.forklift_id) || "Desconocido";
      if (!byForklift[m.forklift_id]) byForklift[m.forklift_id] = { name, totalCost: 0, count: 0 };
      byForklift[m.forklift_id].totalCost += Number(m.cost || 0);
      byForklift[m.forklift_id].count++;
    });
    return Object.values(byForklift);
  })();

  const chartData = [...data].sort((a, b) => b.totalCost - a.totalCost);

  const columns: ColumnDef<Row>[] = [
    { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "count", header: "Trabajos", accessorKey: "count", meta: { kind: "money" }, cell: ({ row }) => row.original.count },
    { id: "totalCost", header: "Costo Total", accessorKey: "totalCost", meta: { kind: "money" }, cell: ({ row }) => {formatCurrency(row.original.totalCost)} },
  ];

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.name,
    initialSorting: [{ id: "totalCost", desc: true }],
    paginated: false,
  });

  // R22-B: error state en lugar de "sin mantenimientos" cuando falla la carga.
  if (fError || mError) {
    return (
      <QueryErrorState
        entity="el reporte de costos de mantenimiento"
        onRetry={() => { void fRefetch(); void mRefetch(); }}
        isRetrying={fFetching}
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Costos de Mantenimiento por Unidad</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("costos-mantenimiento.csv", chartData)}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
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
