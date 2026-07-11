import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { differenceInDays, parseISO, isWithinInterval } from "date-fns";
import { Download } from "@/components/icons";
import { useForklifts } from "@/features/fleet";
import { useBookings } from "@/features/bookings";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { name: string; bookedDays: number; totalDays: number; utilization: number };

export function UtilizationReport({ startDate, endDate }: Props) {
  const { data: forklifts = [] } = useForklifts();
  const { data: bookings = [] } = useBookings();

  const data = useMemo<Row[]>(() => {
    const totalDays = Math.max(differenceInDays(endDate, startDate), 1);
    return forklifts.map((fl) => {
      const flBookings = bookings.filter((b) => b.forklift_id === fl.id &&
        isWithinInterval(parseISO(b.start_date), { start: startDate, end: endDate }));
      const bookedDays = flBookings.reduce((sum, b) => sum + differenceInDays(parseISO(b.end_date), parseISO(b.start_date)) + 1, 0);
      const utilization = Math.min(Math.round((bookedDays / totalDays) * 100), 100);
      return { name: fl.name, bookedDays, totalDays, utilization };
    });
  }, [forklifts, bookings, startDate, endDate]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "name", header: "Montacargas", accessorKey: "name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: "bookedDays", header: "Días Reservados", accessorKey: "bookedDays", meta: { align: "right" }, cell: ({ row }) => row.original.bookedDays },
      { id: "totalDays", header: "Días Totales", accessorKey: "totalDays", meta: { align: "right" }, cell: ({ row }) => row.original.totalDays },
      { id: "utilization", header: "Utilización", accessorKey: "utilization", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{row.original.utilization}%</span> },
    ],
    [],
  );

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
            <Download className="h-4 w-4 mr-1" />Exportar CSV
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
