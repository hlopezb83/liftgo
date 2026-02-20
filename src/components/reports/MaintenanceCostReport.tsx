import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { parseISO, isWithinInterval } from "date-fns";
import { Download } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  maintenanceLogs: Tables<"maintenance_logs">[];
  forklifts: Tables<"forklifts">[];
  startDate: Date;
  endDate: Date;
}

export function MaintenanceCostReport({ maintenanceLogs, forklifts, startDate, endDate }: Props) {
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
  }, [maintenanceLogs, forklifts, startDate, endDate, forkliftMap]);

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Montacargas</TableHead>
                <TableHead className="text-right">Trabajos</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.totalCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}