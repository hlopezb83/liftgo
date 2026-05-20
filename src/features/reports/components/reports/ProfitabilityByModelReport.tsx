// arch:excepción §19 (tabla densa de reporte)
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
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
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

interface Forklift { id: string; name: string; manufacturer?: string | null; model?: string | null }
interface Booking { id: string; forklift_id: string }
interface Invoice { status: string; paid_at: string | null; booking_id: string | null; total: number | string }
interface MaintLog { forklift_id: string; performed_at: string | null; cost: number | string | null }
interface DamageRec { forklift_id: string; created_at: string | null; actual_cost: number | string | null }

function inRange(dateStr: string | null | undefined, start: Date, end: Date) {
  if (!dateStr) return false;
  try {
    return isWithinInterval(new Date(dateStr), { start, end });
  } catch {
    return false;
  }
}

function buildModelUnitsMap(forklifts: Forklift[]) {
  const forkliftModel = new Map<string, string>();
  const modelUnits = new Map<string, Set<string>>();
  for (const f of forklifts) {
    const key = [f.manufacturer, f.model].filter(Boolean).join(" ") || f.name;
    forkliftModel.set(f.id, key);
    if (!modelUnits.has(key)) modelUnits.set(key, new Set());
    modelUnits.get(key)?.add(f.id);
  }
  return { forkliftModel, modelUnits };
}

function buildRevenueMap(invoices: Invoice[], bookings: Booking[], start: Date, end: Date) {
  const bookingForklift = new Map<string, string>();
  for (const b of bookings) bookingForklift.set(b.id, b.forklift_id);
  const map = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.status !== "paid" || !inRange(inv.paid_at, start, end)) continue;
    const fId = inv.booking_id ? bookingForklift.get(inv.booking_id) : undefined;
    if (!fId) continue;
    map.set(fId, (map.get(fId) || 0) + Number(inv.total));
  }
  return map;
}

function buildCostMap<T extends { forklift_id: string }>(items: T[], dateOf: (i: T) => string | null, costOf: (i: T) => number, start: Date, end: Date) {
  const map = new Map<string, number>();
  for (const it of items) {
    if (!inRange(dateOf(it), start, end)) continue;
    map.set(it.forklift_id, (map.get(it.forklift_id) || 0) + costOf(it));
  }
  return map;
}

function aggregateRows(modelUnits: Map<string, Set<string>>, revenueByForklift: Map<string, number>, maintByForklift: Map<string, number>, dmgByForklift: Map<string, number>): ModelRow[] {
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
  return result;
}

export function ProfitabilityByModelReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();
  const { data: invoices = [] } = useInvoices();
  const { data: maintenanceLogs = [] } = useMaintenanceLogs();
  const { data: damageRecords = [] } = useDamageRecords();

  const rows = useMemo<ModelRow[]>(() => {
    const { modelUnits } = buildModelUnitsMap(forklifts as Forklift[]);
    const revenueByForklift = buildRevenueMap(invoices as Invoice[], bookings as Booking[], startDate, endDate);
    const maintByForklift = buildCostMap(maintenanceLogs as MaintLog[], (l) => l.performed_at, (l) => Number(l.cost || 0), startDate, endDate);
    const dmgByForklift = buildCostMap(damageRecords as DamageRec[], (d) => d.created_at, (d) => Number(d.actual_cost || 0), startDate, endDate);
    return aggregateRows(modelUnits, revenueByForklift, maintByForklift, dmgByForklift);
  }, [forklifts, invoices, bookings, maintenanceLogs, damageRecords, startDate, endDate]);

  const chartRows = useMemo(() => [...rows].sort((a, b) => b.profit - a.profit), [rows]);

  const columns = useMemo<ColumnDef<ModelRow>[]>(
    () => [
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
    ],
    [],
  );

  const table = useLiftgoTable<ModelRow>({
    data: rows,
    columns,
    getRowId: (r) => r.model,
    initialSorting: [{ id: "profit", desc: true }],
    paginated: false,
  });

  const chartConfig = { profit: { label: "Ganancia Neta" } };

  const handleExport = () => {
    exportToCsv("rentabilidad_por_modelo.csv", chartRows.map(r => ({
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
          {chartRows.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No hay datos para el rango seleccionado.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[400px] w-full">
              <BarChart data={chartRows} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v: number) => formatCurrency(v)} />
                <YAxis type="category" dataKey="model" width={160} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="profit" name="Ganancia Neta" radius={[0, 4, 4, 0]}>
                  {chartRows.map((r, i) => (
                    <Cell key={i} fill={r.profit >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalle por Modelo</CardTitle></CardHeader>
        <CardContent>
          <DataTableV2 table={table} emptyMessage="No hay datos para el rango seleccionado." />
        </CardContent>
      </Card>
    </div>
  );
}
