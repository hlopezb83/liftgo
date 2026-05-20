import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { exportToCsv } from "@/lib/exportCsv";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import { useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useMaintenanceLogs } from "@/features/maintenance/hooks/maintenance/useMaintenanceLogs";
import { useDamageRecords } from "@/features/damage/hooks/useDamageRecords";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import {
  aggregateRows, buildCostMap, buildModelUnitsMap, buildRevenueMap,
  type Booking, type DamageRec, type Forklift, type Invoice, type MaintLog, type ModelRow,
} from "./profitabilityByModel/profitabilityHelpers";
import { ProfitabilityChart } from "./profitabilityByModel/ProfitabilityChart";
import { profitabilityColumns } from "./profitabilityByModel/profitabilityColumns";

interface Props {
  startDate: Date;
  endDate: Date;
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

  const table = useLiftgoTable<ModelRow>({
    data: rows,
    columns: profitabilityColumns,
    getRowId: (r) => r.model,
    initialSorting: [{ id: "profit", desc: true }],
    paginated: false,
  });

  const handleExport = () => {
    exportToCsv("rentabilidad_por_modelo.csv", chartRows.map((r) => ({
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
          <ProfitabilityChart chartRows={chartRows} />
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
