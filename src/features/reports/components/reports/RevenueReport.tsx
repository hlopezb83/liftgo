
import { format, parseISO, isWithinInterval, startOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvoices } from "@/features/invoices";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMonthShortEsFromDate } from "@/lib/format/formatMonthEs";
import { toMxn } from "@/lib/money";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { month: string; invoiced: number; paid: number; count: number };

export function RevenueReport({ startDate, endDate }: Props) {
  const { data: invoices = [] } = useInvoices();
  const data: Row[] = (() => {
    // R7 Bloque 5: excluir borradores y canceladas — no son ingreso reconocido.
    const revenueInvoices = invoices.filter(
      (inv) => inv.status !== "draft" && inv.status !== "cancelled",
    );
    const filtered = revenueInvoices.filter((inv) => isWithinInterval(parseISO(inv.issued_at), { start: startDate, end: endDate }));
    const months: Record<string, Row> = {};
    filtered.forEach((inv) => {
      const key = format(startOfMonth(parseISO(inv.issued_at)), "yyyy-MM");
      const label = formatMonthShortEsFromDate(startOfMonth(parseISO(inv.issued_at)));
      if (!months[key]) months[key] = { month: label, invoiced: 0, paid: 0, count: 0 };
      // R6-B2: normalizar a MXN cuando la factura está en USD.
      const totalMxn = toMxn(
        Number(inv.total),
        (inv as { moneda?: string | null }).moneda ?? "MXN",
        (inv as { tipo_cambio?: number | string | null }).tipo_cambio,
      );
      months[key].invoiced += totalMxn;
      months[key].count++;
      if (inv.status === "paid") months[key].paid += totalMxn;
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
