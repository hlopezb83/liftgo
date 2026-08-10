
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOKINGS_RANGE_LIMIT, useBookingsRange } from "@/features/bookings";
import { chartGridProps, chartTick } from "@/lib/charts/chartTheme";
import { exportToCsv } from "@/lib/exportCsv";
import { useUtilizationByUnitReport } from "../../hooks/useUtilizationReportData";
import { bookingsForForkliftInRange, type DrilldownBooking } from "../../lib/drilldown";
import { UtilizationDetailSheet } from "./drilldown/UtilizationDetailSheet";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { id: string; name: string; bookedDays: number; totalDays: number; utilization: number };

function TruncatedRangeAlert() {
  return (
    <Alert>
      <WarnIcon className="h-4 w-4" />
      <AlertDescription>
        El rango seleccionado supera {BOOKINGS_RANGE_LIMIT} reservas; el detalle por
        unidad muestra solo las primeras {BOOKINGS_RANGE_LIMIT}. Reduce el rango de
        fechas para ver el detalle completo.
      </AlertDescription>
    </Alert>
  );
}

function UtilizationChartCard({ data }: { data: Row[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Utilización de Flota</CardTitle>
        <Button variant="outline" size="sm" onClick={() => exportToCsv("reporte-utilizacion.csv", data.map((r) => ({ id: r.id, name: r.name, bookedDays: r.bookedDays, totalDays: r.totalDays, utilization: r.utilization })))}>
          <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="h-64" style={{ minWidth: `${Math.max(data.length * 32, 320)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" tick={chartTick} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis unit="%" width={40} tick={chartTick} />
                <Tooltip formatter={(val) => `${Number(val)}%`} />
                <Bar dataKey="utilization" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const UTILIZATION_COLUMNS: ColumnDef<Row>[] = [
  { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { id: "bookedDays", header: "Días Reservados", accessorKey: "bookedDays", meta: { kind: "number" }, cell: ({ row }) => row.original.bookedDays },
  { id: "totalDays", header: "Días Totales", accessorKey: "totalDays", meta: { kind: "number" }, cell: ({ row }) => row.original.totalDays },
  { id: "utilization", header: "Utilización", accessorKey: "utilization", meta: { kind: "number" }, cell: ({ row }) => <span className="font-mono">{row.original.utilization}%</span> },
];

function toDrilldownBooking(b: {
  id: string;
  booking_number: string;
  customer_name: string | null;
  forklift_id: string;
  start_date: string;
  end_date: string;
  status: string;
}): DrilldownBooking {
  return {
    id: b.id,
    booking_number: b.booking_number,
    customer_name: b.customer_name,
    forklift_id: b.forklift_id,
    start_date: b.start_date,
    end_date: b.end_date,
    status: b.status,
  };
}
function SelectedUnitSheet({ selected, onClose, totalDaysRange, bookings }: {
  selected: Row | null;
  onClose: () => void;
  totalDaysRange: number;
  bookings: DrilldownBooking[];
}) {
  return (
    <UtilizationDetailSheet
      open={selected !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      forkliftName={selected?.name ?? null}
      bookedDays={selected?.bookedDays ?? 0}
      totalDays={selected?.totalDays ?? totalDaysRange}
      utilization={selected?.utilization ?? 0}
      bookings={bookings}
    />
  );
}


export function UtilizationReport({ startDate, endDate }: Props) {
  // FIX-FE-01: agregación server-side vía RPC (useBookings/useForklifts están
  // capados a 501 filas). La unión de días anti-traslape vive en SQL.
  const { data = [], isError, isFetching, refetch } = useUtilizationByUnitReport(startDate, endDate);
  // Drilldown: solo reservas que se traslapan con el rango (filtro server-side).
  const { data: bookingsRaw = [] } = useBookingsRange(startDate, endDate);
  // R2 Bajo 13b: el drilldown está capado a BOOKINGS_RANGE_LIMIT reservas; antes
  // solo había un console.warn invisible para el usuario. Recortar y avisar.
  const rangeTruncated = bookingsRaw.length > BOOKINGS_RANGE_LIMIT;
  const bookings = rangeTruncated ? bookingsRaw.slice(0, BOOKINGS_RANGE_LIMIT) : bookingsRaw;
  const [selected, setSelected] = useState<Row | null>(null);
  const totalDaysRange = data[0]?.totalDays ?? Math.max(
    Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
    1,
  );

  const drilldownBookings: DrilldownBooking[] = bookings.map(toDrilldownBooking);
  const selectedBookings = selected
    ? bookingsForForkliftInRange(drilldownBookings, selected.id, startDate, endDate)
    : [];

  const columns = UTILIZATION_COLUMNS;

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.id,
    initialSorting: [{ id: "utilization", desc: true }],
    paginated: false,
  });


  // R22-B: nunca mostrar "sin datos" (ni exportar CSV vacío) cuando la carga falló.
  if (isError) {
    return (
      <QueryErrorState
        entity="el reporte de utilización"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <>
      {rangeTruncated ? <TruncatedRangeAlert /> : null}
      <UtilizationChartCard data={data} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <DataTableV2
            table={table}
            emptyMessage="Sin datos en el rango"
            onRowClick={(r) => setSelected(r)}
          />
        </CardContent>
      </Card>
      <SelectedUnitSheet
        selected={selected}
        onClose={() => setSelected(null)}
        totalDaysRange={totalDaysRange}
        bookings={selectedBookings}
      />
    </>

  );
}
