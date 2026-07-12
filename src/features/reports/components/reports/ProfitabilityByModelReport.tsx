
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookings } from "@/features/bookings";
import { useDamageRecords } from "@/features/damage";
import { useForklifts } from "@/features/fleet";
import { useInvoices } from "@/features/invoices";
import { useMaintenanceLogs } from "@/features/maintenance";
import { exportToCsv } from "@/lib/exportCsv";
import { ProfitabilityChart } from "./profitabilityByModel/ProfitabilityChart";
import { profitabilityColumns } from "./profitabilityByModel/profitabilityColumns";
import {
  aggregateRows, buildCostMap, buildModelUnitsMap, buildRevenueMap,
  type Booking, type DamageRec, type Forklift, type Invoice, type MaintLog, type ModelRow,
} from "./profitabilityByModel/profitabilityHelpers";

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

  const rows: ModelRow[] = (() => {
    const { modelUnits } = buildModelUnitsMap(forklifts as Forklift[]);
    const revenueByForklift = buildRevenueMap(invoices as Invoice[], bookings as Booking[], startDate, endDate);
    const maintByForklift = buildCostMap(maintenanceLogs as MaintLog[], (l) => l.performed_at, (l) => Number(l.cost || 0), startDate, endDate);
    const dmgByForklift = buildCostMap(damageRecords as DamageRec[], (d) => d.created_at, (d) => Number(d.actual_cost || 0), startDate, endDate);
    return aggregateRows(modelUnits, revenueByForklift, maintByForklift, dmgByForklift);
  })();

  const chartRows = [...rows].sort((a, b) => b.profit - a.profit);

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
            <DownloadIcon className="h-4 w-4 mr-2" /> Exportar CSV
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
