import { useInvoices } from "@/hooks/useInvoices";
import { useCollectionNotes } from "@/hooks/useCollectionNotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
import { exportToCsv } from "@/lib/exportCsv";
import { useMemo } from "react";

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

export function AgingReport({ startDate, endDate }: AgingReportProps) {
  const { data: invoices } = useInvoices();

  const overdueInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices
      .filter((i) => ["sent", "overdue", "partial"].includes(i.status) && i.due_date && parseISO(i.due_date) < new Date())
      .map((i) => ({
        ...i,
        days_overdue: differenceInDays(new Date(), parseISO(i.due_date!)),
        bucket: getAgingBucket(differenceInDays(new Date(), parseISO(i.due_date!))),
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
      {/* Bucket Summary */}
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
          {overdueInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay facturas vencidas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Bucket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueInvoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono font-medium">{i.invoice_number}</TableCell>
                    <TableCell>{i.customer_name || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(i.total))}</TableCell>
                    <TableCell>{formatDateDisplay(i.due_date)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-destructive">{i.days_overdue}</TableCell>
                    <TableCell>{i.bucket}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
