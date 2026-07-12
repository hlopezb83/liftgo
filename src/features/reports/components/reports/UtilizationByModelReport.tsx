
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookings } from "@/features/bookings";
import { useForklifts } from "@/features/fleet";
import { exportToCsv } from "@/lib/exportCsv";
import { UtilizationChart } from "./utilizationByModel/UtilizationChart";
import { utilizationColumns } from "./utilizationByModel/utilizationColumns";
import { buildUtilizationRows, type ModelRow } from "./utilizationByModel/utilizationHelpers";

interface Props {
  startDate: Date;
  endDate: Date;
}

export function UtilizationByModelReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();

  const data: ModelRow[] = buildUtilizationRows(forklifts, bookings, startDate, endDate);

  const table = useLiftgoTable<ModelRow>({
    data,
    columns: utilizationColumns,
    getRowId: (r) => r.model,
    initialSorting: [{ id: "utilization", desc: true }],
    paginated: false,
  });

  const chartData = [...data].sort((a, b) => b.utilization - a.utilization);

  const handleExport = () => {
    exportToCsv("reporte-utilizacion-modelo.csv", chartData.map((r) => ({
      Modelo: r.model,
      Unidades: r.units,
      Disponibles: r.available,
      Rentados: r.rented,
      "Días Reservados": r.bookedDays,
      "Días Totales": r.totalDays,
      "Utilización %": r.utilization,
    })));
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Utilización por Modelo</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <UtilizationChart chartData={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="No hay equipos activos para mostrar" />
        </CardContent>
      </Card>
    </>
  );
}
