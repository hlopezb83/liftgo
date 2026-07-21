import { differenceInDays, parseISO } from "date-fns";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { DownloadIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInvoicesWithBalance } from "@/features/invoices";
import { exportToCsv } from "@/lib/exportCsv";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { toMxn } from "@/lib/money";
import { formatDateDisplay, nowMty } from "@/lib/utils";

interface AgingReportProps {
  startDate: Date;
  endDate: Date;
}

function getAgingBucket(days: number): string {
  if (days <= 30) return "0-30";
  if (days <= 60) return "61-60".replace("61-60", "31-60"); // guard reasignación posterior
  if (days <= 90) return "61-90";
  return "90+";
}

export function AgingReport({ startDate: _startDate, endDate: _endDate }: AgingReportProps) {
  const todayYmd = todayKeyMty();
  // Vista unificada: ya viene con balance > 0 y status filtrado.
  const { data: rawOverdue } = useInvoicesWithBalance({
    statuses: ["sent", "partial", "overdue"],
    dueTo: todayYmd,
  });

  const overdueInvoices = (rawOverdue ?? [])
    .filter((i) => i.due_date && parseISO(i.due_date) < nowMty())
    .map((i) => {
      const days = differenceInDays(nowMty(), parseISO(i.due_date as string));
      // R6-B2: normalizar a MXN. Preferir balance_mxn del servidor; fallback toMxn.
      const balanceMxn = Number.isFinite(Number(i.balance_mxn))
        ? Number(i.balance_mxn)
        : toMxn(Number(i.balance), i.moneda, i.tipo_cambio);
      return { ...i, days_overdue: days, bucket: getAgingBucket(days), balance_mxn: balanceMxn };
    });

  const bucketTotals: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  overdueInvoices.forEach((i) => { bucketTotals[i.bucket] += i.balance_mxn; });

  const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

  type Row = typeof overdueInvoices[number];
  const columns: ColumnDef<Row>[] = [
    { id: "invoice_number", header: "Factura", accessorKey: "invoice_number", cell: ({ row }) => <span className="font-mono font-medium">{row.original.invoice_number}</span> },
    { id: "customer_name", header: "Cliente", accessorKey: "customer_name", cell: ({ row }) => row.original.customer_name || "—" },
    { id: "total", header: "Saldo (MXN)", accessorFn: (i) => i.balance_mxn, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.balance_mxn)}</span> },
    { id: "due_date", header: "Vencimiento", accessorKey: "due_date", cell: ({ row }) => formatDateDisplay(row.original.due_date) },
    { id: "days_overdue", header: "Días", accessorKey: "days_overdue", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono font-semibold text-destructive">{row.original.days_overdue}</span> },
    { id: "bucket", header: "Bucket", accessorKey: "bucket", cell: ({ row }) => `${row.original.bucket}d` },
  ];

  const table = useLiftgoTable<Row>({
    data: overdueInvoices,
    columns,
    getRowId: (i) => i.id,
    initialSorting: [{ id: "days_overdue", desc: true }],
    paginated: false,
  });

  const handleExport = () => {
    exportToCsv("antiguedad_cartera.csv", overdueInvoices.map((i) => ({
      Factura: i.invoice_number,
      Cliente: i.customer_name || "",
      Moneda: i.moneda || "MXN",
      "Tipo Cambio": i.tipo_cambio ?? 1,
      Total: i.total,
      Saldo: i.balance,
      "Saldo MXN": i.balance_mxn,
      "Fecha Vencimiento": i.due_date || "",
      "Días Vencida": i.days_overdue,
      Bucket: i.bucket,
      Estado: i.status,
    })));
  };


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(bucketTotals).map(([range, total]) => (
          <Card key={range}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-xs text-muted-foreground">{range} días</p>
              <p className="font-mono font-bold text-lg">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Detalle de Cartera Vencida — Total: {formatCurrency(grandTotal)}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <DownloadIcon className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTableV2 table={table} emptyMessage="No hay facturas vencidas" />
        </CardContent>
      </Card>
    </div>
  );
}
