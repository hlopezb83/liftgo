import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { formatCurrency } from "@/lib/formatCurrency";
import { exportToCsv } from "@/lib/exportCsv";
import { isWithinInterval } from "date-fns";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import { useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useMaintenanceLogs } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useDamageRecords } from "@/features/damage/hooks/useDamageRecords";
import { DataTable } from "@/components/DataTable";
import { cn } from "@/lib/utils";

interface Props {
  startDate: Date;
  endDate: Date;
}

interface ModelRow {
  model: string;
  units: number;
  revenue: number;
  maintenance: number;
  damages: number;
  profit: number;
  margin: number;
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date) {
  if (!dateStr) return false;
  try {
    return isWithinInterval(new Date(dateStr), { start, end });
  } catch {
    return false;
  }
}

export function ProfitabilityByModelReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();
  const { data: invoices = [] } = useInvoices();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const { data: damageRecords = [] } = useDamageRecords();
  const rows = useMemo<ModelRow[]>(() => {
    const forkliftModel = new Map<string, string>();
    const modelUnits = new Map<string, Set<string>>();
    for (const f of forklifts) {
      const key = [f.manufacturer, f.model].filter(Boolean).join(" ") || f.name;
      forkliftModel.set(f.id, key);
      if (!modelUnits.has(key)) modelUnits.set(key, new Set());
      const set = modelUnits.get(key);
      if (set) set.add(f.id);
    }
    const bookingForklift = new Map<string, string>();
    for (const b of bookings) bookingForklift.set(b.id, b.forklift_id);
    const revenueByForklift = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== "paid" || !inRange(inv.paid_at, startDate, endDate)) continue;
      const fId = inv.booking_id ? bookingForklift.get(inv.booking_id) : undefined;
      if (!fId) continue;
      revenueByForklift.set(fId, (revenueByForklift.get(fId) || 0) + Number(inv.total));
    }
    const maintByForklift = new Map<string, number>();
    for (const log of maintenanceLogs) {
      if (!inRange(log.performed_at, startDate, endDate)) continue;
      maintByForklift.set(log.forklift_id, (maintByForklift.get(log.forklift_id) || 0) + Number(log.cost || 0));
    }
    const dmgByForklift = new Map<string, number>();
    for (const d of damageRecords) {
      if (!inRange(d.created_at, startDate, endDate)) continue;
      dmgByForklift.set(d.forklift_id, (dmgByForklift.get(d.forklift_id) || 0) + Number(d.actual_cost || 0));
    }
    const result: ModelRow[] = [];
    for (const [model, ids] of modelUnits) {
      let revenue = 0, maintenance = 0, damages = 0;
      for (const fId of ids) {
        revenue += revenueByForklift.get(fId) || 0;
        maintenance += maintByForklift.get(fId) || 0;
        damages += dmgByForklift.get(fId) || 0;
      }
      const profit = revenue - maintenance - damages;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      result.push({ model, units: ids.size, revenue, maintenance, damages, profit, margin });
    }
    return result.sort((a, b) => b.profit - a.profit);
  }, [forklifts, invoices, bookings, maintenanceLogs, damageRecords, startDate, endDate]);

  const columns = useMemo(() => [
    { key: "model", label: "Modelo", sortable: true, render: (r: ModelRow) => <span className="font-medium">{r.model}</span> },
    { key: "units", label: "Unidades", align: "right" as const, sortable: true, render: (r: ModelRow) => r.units },
    { key: "revenue", label: "Ingresos", align: "right" as const, sortable: true, render: (r: ModelRow) => formatCurrency(r.revenue) },
    { key: "maintenance", label: "Mantenimiento", align: "right" as const, sortable: true, render: (r: ModelRow) => formatCurrency(r.maintenance) },
    { key: "damages", label: "Daños", align: "right" as const, sortable: true, render: (r: ModelRow) => formatCurrency(r.damages) },
    { key: "profit", label: "Ganancia Neta", align: "right" as const, sortable: true, render: (r: ModelRow) => <span className={cn("font-semibold", r.profit >= 0 ? "text-chart-2" : "text-destructive")}>{formatCurrency(r.profit)}</span> },
    { key: "margin", label: "Margen %", align: "right" as const, sortable: true, render: (r: ModelRow) => `${r.margin.toFixed(1)}%` },
  ], []);

  const chartConfig = { profit: { label: "Ganancia Neta" } };

  const handleExport = () => {
    exportToCsv("rentabilidad_por_modelo.csv", rows.map(r => ({
      Modelo: r.model,
      Unidades: r.units,
      Ingresos: r.revenue.toFixed(2),
      Mantenimiento: r.maintenance.toFixed(2),
      Daños: r.damages.toFixed(2),
      "Ganancia Neta": r.profit.toFixed(2),
      "Margen %": r.margin.toFixed(1),
    })));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ganancia Neta por Modelo</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No hay datos para el rango seleccionado.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[400px] w-full">
              <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
                <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 12 }} />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="profit" name="Ganancia Neta" radius={[0, 4, 4, 0]}>
                  {rows.map((r, i) => (
                    <Cell key={i} fill={r.profit >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle por Modelo</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={rows}
            keyExtractor={(r) => r.model}
            emptyMessage="No hay datos para el rango seleccionado."
            defaultSortKey="profit"
            defaultSortDirection="desc"
            columns={columns}
          />
        </CardContent>
      </Card>
    </div>
  );
}
