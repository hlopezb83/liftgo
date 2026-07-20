import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { DownloadIcon, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exportToCsv } from "@/lib/exportCsv";
import { useProfitByModelReport, type ModelRow } from "../../hooks/useProfitByModelReport";
import { ProfitabilityChart } from "./profitabilityByModel/ProfitabilityChart";
import { profitabilityColumns } from "./profitabilityByModel/profitabilityColumns";

interface Props {
  startDate: Date;
  endDate: Date;
}

/**
 * EC-A4: se dejó de cargar toda la app (`useForklifts`, `useBookings`,
 * `useInvoices`, `useMaintenanceLogs`, `useDamageRecords`) y de agregar en
 * cliente — esa lectura se truncaba por los límites de PostgREST. Ahora la
 * agregación completa la hace el RPC `report_profit_by_model`.
 */
export function ProfitabilityByModelReport({ startDate, endDate }: Props) {
  const { data: rows = [], isLoading, isError, refetch } = useProfitByModelReport(startDate, endDate);

  const table = useLiftgoTable<ModelRow>({
    data: rows,
    columns: profitabilityColumns,
    getRowId: (r) => r.model,
    initialSorting: [{ id: "profit", desc: true }],
    paginated: false,
  });

  const handleExport = () => {
    exportToCsv("rentabilidad_por_modelo.csv", rows.map((r) => ({
      Modelo: r.model,
      Unidades: r.units,
      Ingresos: r.revenue.toFixed(2),
      Mantenimiento: r.maintenance.toFixed(2),
      Daños: r.damages.toFixed(2),
      "Ganancia Neta": r.profit.toFixed(2),
      "Margen %": r.margin.toFixed(1),
    })));
  };

  if (isError) {
    return (
      <Alert variant="destructive">
        <WarnIcon className="h-4 w-4" />
        <AlertTitle>No se pudo cargar el reporte</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>Ocurrió un error al calcular la rentabilidad por modelo.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ganancia Neta por Modelo</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoading || rows.length === 0}>
            <DownloadIcon className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : <ProfitabilityChart chartRows={rows} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalle por Modelo</CardTitle></CardHeader>
        <CardContent>
          {isLoading
            ? <Skeleton className="h-40 w-full" />
            : <DataTableV2 table={table} emptyMessage="No hay datos para el rango seleccionado." />}
        </CardContent>
      </Card>
    </div>
  );
}
