import { useInvoices } from "@/hooks/useInvoices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";
import { exportToCsv } from "@/lib/exportCsv";
import { useMemo } from "react";
import { DataTable } from "@/components/DataTable";

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
  const { data: invoices } = useInvoices();

  const overdueInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices
      .filter((i) => ["sent", "overdue", "partial"].includes(i.status) && i.due_date && parseISO(i.due_date) < nowMty())
      .map((i) => ({
        ...i,
        days_overdue: differenceInDays(nowMty(), parseISO(i.due_date as string)),
        bucket: getAgingBucket(differenceInDays(nowMty(), parseISO(i.due_date as string))),
      }))
      .sort((a, b) => b.days_overdue - a.days_overdue);
  }, [invoices]);

  const bucketTotals = useMemo(() => {
    const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    overdueInvoices.forEach((i) => { buckets[i.bucket] += Number(i.total); });
    return buckets;
  }, [overdueInvoices]);

  const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

  const handleExport = () => {
    exportToCsv("antiguedad_cartera.csv", overdueInvoices.map((i) => ({
      Factura: i.invoice_number,
      Cliente: i.customer_name || "",
      Monto: Number(i.total),
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
          <DataTable
            data={overdueInvoices}
            keyExtractor={(i) => i.id}
            emptyMessage="No hay facturas vencidas"
            defaultSortKey="days_overdue"
            defaultSortDirection="desc"
            columns={[
              { key: "invoice_number", label: "Factura", sortable: true, render: (i) => <span className="font-mono font-medium">{i.invoice_number}</span> },
              { key: "customer_name", label: "Cliente", sortable: true, render: (i) => i.customer_name || "—" },
              { key: "total", label: "Monto", align: "right", sortable: true, accessor: (i) => Number(i.total), render: (i) => <span className="font-mono">{formatCurrency(Number(i.total))}</span> },
              { key: "due_date", label: "Vencimiento", sortable: true, render: (i) => formatDateDisplay(i.due_date) },
              { key: "days_overdue", label: "Días", align: "right", sortable: true, render: (i) => <span className="font-mono font-semibold text-destructive">{i.days_overdue}</span> },
              { key: "bucket", label: "Bucket", sortable: true, render: (i) => `${i.bucket}d` },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
