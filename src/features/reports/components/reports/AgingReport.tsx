import { useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";
import { exportToCsv } from "@/lib/exportCsv";
import { useMemo } from "react";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

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
  const { data: payments } = useQuery({
    queryKey: ["payments", "all"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("invoice_id, amount");
      if (error) throw error;
      return data;
    },
  });

  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments ?? []) {
      map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount));
    }
    return map;
  }, [payments]);

  const overdueInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices
      .filter((i) => ["sent", "overdue", "partial"].includes(i.status) && i.due_date && parseISO(i.due_date) < nowMty())
      .map((i) => {
        const balance = Math.max(Number(i.total) - (paidByInvoice.get(i.id) ?? 0), 0);
        return {
          ...i,
          balance,
          days_overdue: differenceInDays(nowMty(), parseISO(i.due_date as string)),
          bucket: getAgingBucket(differenceInDays(nowMty(), parseISO(i.due_date as string))),
        };
      })
      .filter((i) => i.balance > 0);
  }, [invoices, paidByInvoice]);

  const bucketTotals = useMemo(() => {
    const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    overdueInvoices.forEach((i) => { buckets[i.bucket] += Number(i.total); });
    return buckets;
  }, [overdueInvoices]);

  const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

  type Row = typeof overdueInvoices[number];
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "invoice_number", header: "Factura", accessorKey: "invoice_number", cell: ({ row }) => <span className="font-mono font-medium">{row.original.invoice_number}</span> },
      { id: "customer_name", header: "Cliente", accessorKey: "customer_name", cell: ({ row }) => row.original.customer_name || "—" },
      { id: "total", header: "Monto", accessorFn: (i) => Number(i.total), meta: { align: "right" }, cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.total))}</span> },
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
          <DataTableV2 table={table} emptyMessage="No hay facturas vencidas" />
        </CardContent>
      </Card>
    </div>
  );
}
