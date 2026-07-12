
import { differenceInDays, parseISO, isWithinInterval } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookings } from "@/features/bookings";
import { useForklifts } from "@/features/fleet";
import { exportToCsv } from "@/lib/exportCsv";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { name: string; bookedDays: number; totalDays: number; utilization: number };

export function UtilizationReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();

  const totalDaysRange = Math.max(differenceInDays(endDate, startDate), 1);
  const data: Row[] = forklifts.map((fl) => {
    const flBookings = bookings.filter((b) => b.forklift_id === fl.id &&
      isWithinInterval(parseISO(b.start_date), { start: startDate, end: endDate }));
    const bookedDays = flBookings.reduce((sum, b) => sum + differenceInDays(parseISO(b.end_date), parseISO(b.start_date)) + 1, 0);
    const utilization = Math.min(Math.round((bookedDays / totalDaysRange) * 100), 100);
    return { name: fl.name, bookedDays, totalDays: totalDaysRange, utilization };
  });

  const columns: ColumnDef<Row>[] = [
    { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: "bookedDays", header: "Días Reservados", accessorKey: "bookedDays", meta: { align: "right" }, cell: ({ row }) => row.original.bookedDays },
    { id: "totalDays", header: "Días Totales", accessorKey: "totalDays", meta: { align: "right" }, cell: ({ row }) => row.original.totalDays },
    { id: "utilization", header: "Utilización", accessorKey: "utilization", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{row.original.utilization}%</span> },
  ];

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.name,
    initialSorting: [{ id: "utilization", desc: true }],
    paginated: false,
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Utilización de Flota</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("reporte-utilizacion.csv", data)}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis unit="%" />
                <Tooltip formatter={(val) => `${Number(val)}%`} />
                <Bar dataKey="utilization" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="Sin datos en el rango" />
        </CardContent>
      </Card>
    </>
  );
}
