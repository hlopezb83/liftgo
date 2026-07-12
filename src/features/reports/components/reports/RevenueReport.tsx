
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { formatMonthShortEsFromDate } from "@/lib/format/formatMonthEs";
import { DownloadIcon } from "@/components/icons";
import { useInvoices } from "@/features/invoices";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { month: string; invoiced: number; paid: number; count: number };

export function RevenueReport({ startDate, endDate }: Props) {
  const { data: invoices = [] } = useInvoices();
  const data: Row[] = (() => {
    const filtered = invoices.filter((inv) => isWithinInterval(parseISO(inv.issued_at), { start: startDate, end: endDate }));
    const months: Record<string, Row> = {};
    filtered.forEach((inv) => {
      const key = format(startOfMonth(parseISO(inv.issued_at)), "yyyy-MM");
      const label = formatMonthShortEsFromDate(startOfMonth(parseISO(inv.issued_at)));
      if (!months[key]) months[key] = { month: label, invoiced: 0, paid: 0, count: 0 };
      months[key].invoiced += Number(inv.total);
      months[key].count++;
      if (inv.status === "paid") months[key].paid += Number(inv.total);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => d);
  })();

  const columns: ColumnDef<Row>[] = [
    { id: "month", header: "Mes", accessorKey: "month", cell: ({ row }) => <span className="font-medium">{row.original.month}</span> },
    { id: "count", header: "Facturas", accessorKey: "count", meta: { align: "right" }, cell: ({ row }) => row.original.count },
    { id: "invoiced", header: "Facturado", accessorKey: "invoiced", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.invoiced)}</span> },
    { id: "paid", header: "Pagado", accessorKey: "paid", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.paid)}</span> },
  ];

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.month,
    paginated: false,
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ingresos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => exportToCsv("reporte-ingresos.csv", data)}>
            <DownloadIcon className="h-4 w-4 mr-1" />Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(val) => formatCurrency(Number(val))} />
                <Bar dataKey="invoiced" fill="hsl(var(--chart-3))" name="Facturado" radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" fill="hsl(var(--chart-2))" name="Pagado" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <DataTableV2 table={table} emptyMessage="Sin facturas en el rango" />
        </CardContent>
      </Card>
    </>
  );
}
