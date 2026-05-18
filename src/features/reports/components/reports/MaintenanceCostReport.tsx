import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { parseISO, isWithinInterval } from "date-fns";
import { Download } from "lucide-react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useMaintenanceLogs } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { DataTable } from "@/components/DataTable";

interface Props {
  startDate: Date;
  endDate: Date;
}

export function MaintenanceCostReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const forkliftMap = useMemo(() => new Map(forklifts.map((f) => [f.id, f.name])), [forklifts]);

  const data = useMemo(() => {
    const filtered = maintenanceLogs.filter((m) => isWithinInterval(parseISO(m.performed_at), { start: startDate, end: endDate }));
    const byForklift: Record<string, { name: string; totalCost: number; count: number }> = {};
    filtered.forEach((m) => {
      const name = forkliftMap.get(m.forklift_id) || "Desconocido";
      if (!byForklift[m.forklift_id]) byForklift[m.forklift_id] = { name, totalCost: 0, count: 0 };
      byForklift[m.forklift_id].totalCost += Number(m.cost || 0);
      byForklift[m.forklift_id].count++;
    });
    return Object.values(byForklift).sort((a, b) => b.totalCost - a.totalCost);
  }, [maintenanceLogs, startDate, endDate, forkliftMap]);

  const columns = useMemo(() => [
    { key: "name", label: "Montacargas", sortable: true, render: (r: typeof data[number]) => <span className="font-medium">{r.name}</span> },
    { key: "count", label: "Trabajos", align: "right" as const, sortable: true, render: (r: typeof data[number]) => r.count },
    { key: "totalCost", label: "Costo Total", align: "right" as const, sortable: true, render: (r: typeof data[number]) => <span className="font-mono">{formatCurrency(r.totalCost)}</span> },
  ], []);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Costos de Mantenimiento por Unidad</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("costos-mantenimiento.csv", data)}>
            <Download className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Bar dataKey="totalCost" fill="hsl(var(--chart-4))" name="Costo" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={data}
            keyExtractor={(r) => r.name}
            emptyMessage="Sin mantenimientos en el rango"
            defaultSortKey="totalCost"
            defaultSortDirection="desc"
            columns={columns}
          />
        </CardContent>
      </Card>
    </>
  );
}
