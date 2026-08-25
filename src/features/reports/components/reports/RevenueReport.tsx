
import { parseISO } from "date-fns";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chartTick } from "@/lib/charts/chartTheme";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMonthShortEsFromDate } from "@/lib/format/formatMonthEs";
import { useRevenueByMonthReport, useRevenueMonthInvoices } from "../../hooks/useRevenueByMonthReport";
import { RevenueMonthDetailSheet } from "./drilldown/RevenueMonthDetailSheet";

interface Props {
  startDate: Date;
  endDate: Date;
}

type Row = { key: string; month: string; invoiced: number; paid: number; count: number };


// R7 Bloque 21.13: eje Y con formato compacto MXN ("$1.2M") para no recortar dígitos.
const COMPACT_MXN = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 1,
});
function compactMoneyMxn(n: number): string {
  return Number.isFinite(n) ? COMPACT_MXN.format(n) : "";
}

export function RevenueReport({ startDate, endDate }: Props) {
  // FIX-FE-01: agregación server-side (patrón useProfitByModelReport).
  // useInvoices() está capado a LIST_FETCH_LIMIT (501 filas) y el reporte
  // subestimaba ingresos silenciosamente con más de 500 facturas.
  const { data: rows = [], isError, isFetching, refetch } = useRevenueByMonthReport(startDate, endDate);
  const [selected, setSelected] = useState<Row | null>(null);
  const data: Row[] = rows.map((r) => ({
    key: r.monthKey,
    month: formatMonthShortEsFromDate(parseISO(`${r.monthKey}-01`)),
    invoiced: r.invoiced,
    paid: r.paid,
    count: r.invoiceCount,
  }));
  // H-2: facturas en divisa sin tipo de cambio quedan fuera de los importes.
  const fxMissingTotal = rows.reduce((s, r) => s + r.fxMissingCount, 0);

  // Drilldown: solo las facturas del mes seleccionado (RPC, sin límite de filas).
  const { data: selectedInvoices = [] } = useRevenueMonthInvoices(selected?.key ?? null);


  const columns: ColumnDef<Row>[] = [
    { id: "month", header: "Mes", accessorKey: "month", cell: ({ row }) => <span className="font-medium">{row.original.month}</span> },
    { id: "count", header: "Facturas", accessorKey: "count", meta: { kind: "money" }, cell: ({ row }) => row.original.count },
    { id: "invoiced", header: "Facturado", accessorKey: "invoiced", meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.invoiced) },
    { id: "paid", header: "Pagado", accessorKey: "paid", meta: { kind: "money" }, cell: ({ row }) => formatCurrency(row.original.paid) },
  ];

  const table = useLiftgoTable<Row>({
    data,
    columns,
    getRowId: (r) => r.key,
    paginated: false,
  });


  // R22-B: si la consulta falló, no mostramos ceros ni permitimos exportar.
  if (isError) {
    return (
      <QueryErrorState
        entity="el reporte de ingresos"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

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
          {fxMissingTotal > 0 && (
            <p className="mb-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              {fxMissingTotal} factura{fxMissingTotal === 1 ? "" : "s"} en divisa sin tipo de cambio
              {fxMissingTotal === 1 ? " no se incluyó" : " no se incluyeron"} en los importes. Captura el
              tipo de cambio para que sumen al reporte.
            </p>
          )}
          <div className="h-64">

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={chartTick} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis width={80} tickFormatter={(v) => compactMoneyMxn(Number(v))} tick={{ fontSize: 11 }} />
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
          <DataTableV2
            table={table}
            emptyMessage="Sin facturas en el rango"
            onRowClick={(r) => setSelected(r)}
          />
        </CardContent>
      </Card>
      <RevenueMonthDetailSheet
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        monthLabel={selected?.month ?? null}
        invoiced={selected?.invoiced ?? 0}
        paid={selected?.paid ?? 0}
        invoices={selectedInvoices}
      />
    </>

  );
}
