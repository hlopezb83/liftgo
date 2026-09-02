
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chartTick } from "@/lib/charts/chartTheme";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCompactCurrency, formatCurrency } from "@/lib/format/formatCurrency";
import { useMaintenanceCostByUnitReport } from "../../hooks/useMaintenanceCostByUnitReport";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { name: string; totalCost: number; count: number };

export function MaintenanceCostReport({ startDate, endDate }: Props) {
  // FIX-FE-01: agregación server-side vía RPC; useMaintenanceLogs() está capado
  // a 501 filas y el costo total quedaba subestimado sin aviso.
  const { data = [], isError, isFetching, refetch } = useMaintenanceCostByUnitReport(startDate, endDate);

  const chartData = [...data].sort((a, b) => b.totalCost - a.totalCost);

  const columns: ColumnDef<Row>[] = [
    { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "count", header: "Trabajos", accessorKey: "count", meta: { kind: "money" }, cell: ({ row }) => row.original.count },
    { id: "totalCost", header: "Costo Total", accessorKey: "totalCost", meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.totalCost) },
  ];

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.name,
    initialSorting: [{ id: "totalCost", desc: true }],
    paginated: false,
  });

  // R22-B: error state en lugar de "sin mantenimientos" cuando falla la carga.
  if (isError) {
    return (
      <QueryErrorState
        entity="el reporte de costos de mantenimiento"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Costos de Mantenimiento por Unidad</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("costos-mantenimiento.csv", chartData.map((r) => ({ name: r.name, totalCost: r.totalCost, count: r.count })))}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className={chartHeightClass}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                {/* R6-FE-11e: nombres de unidad se cortaban a 402px; mismo
                    patrón que UtilizationReport (ángulo + altura). */}
                <XAxis dataKey="name" tick={tick} {...rotatedXAxis} />
                <YAxis tick={tick} width={moneyAxisWidth} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
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
