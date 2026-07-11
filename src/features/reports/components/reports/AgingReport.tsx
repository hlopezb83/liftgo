import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, nowMty } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { exportToCsv } from "@/lib/exportCsv";
import { useMemo } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { useInvoicesWithBalance } from "@/features/invoices";

interface AgingReportProps {
  startDate: Date;
  endDate: Date;
}

function getAgingBucket(days: number): string {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function AgingReport({ startDate: _startDate, endDate: _endDate }: AgingReportProps) {
  const todayYmd = format(nowMty(), "yyyy-MM-dd");
  // Vista unificada: ya viene con balance > 0 y status filtrado.
  const { data: rawOverdue } = useInvoicesWithBalance({
    statuses: ["sent", "partial", "overdue"],
    dueTo: todayYmd,
  });

  const overdueInvoices = useMemo(() => {
    return (rawOverdue ?? [])
      .filter((i) => i.due_date && parseISO(i.due_date) < nowMty())
      .map((i) => {
        const days = differenceInDays(nowMty(), parseISO(i.due_date as string));
        return {
          ...i,
          days_overdue: days,
          bucket: getAgingBucket(days),
        };
      });
  }, [rawOverdue]);

  const bucketTotals = useMemo(() => {
    const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    overdueInvoices.forEach((i) => { buckets[i.bucket] += i.balance; });
    return buckets;
  }, [overdueInvoices]);

  const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

  type Row = typeof overdueInvoices[number];
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "invoice_number", header: "Factura", accessorKey: "invoice_number", cell: ({ row }) => <span className="font-mono font-medium">{row.original.invoice_number}</span> },
      { id: "customer_name", header: "Cliente", accessorKey: "customer_name", cell: ({ row }) => row.original.customer_name || "—" },
      { id: "total", header: "Saldo", accessorFn: (i) => i.balance, meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.balance)}</span> },
      { id: "due_date", header: "Vencimiento", accessorKey: "due_date", cell: ({ row }) => formatDateDisplay(row.original.due_date) },
      { id: "days_overdue", header: "Días", accessorKey: "days_overdue", meta: { align: "right" }, cell: ({ row }) => <span className="font-mono font-semibold text-destructive">{row.original.days_overdue}</span> },
      { id: "bucket", header: "Bucket", accessorKey: "bucket", cell: ({ row }) => `${row.original.bucket}d` },
    ],
    [],
  );

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
      Total: i.total,
      Saldo: i.balance,
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
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
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
