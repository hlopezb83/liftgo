import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { EditPaymentDialog } from "./EditPaymentDialog";
import type { Tables } from "@/integrations/supabase/types";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";

interface InvoicePaymentSummaryProps {
  totalPaid: number;
  balance: number;
  payments: Tables<"payments">[];
}

type Payment = Tables<"payments">;

export function InvoicePaymentSummary({ totalPaid, balance, payments }: InvoicePaymentSummaryProps) {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        id: "payment_date",
        header: "Fecha",
        accessorKey: "payment_date",
        cell: ({ row }) => <span className="text-sm">{formatDateDisplay(row.original.payment_date)}</span>,
      },
      {
        id: "payment_method",
        header: "Método",
        accessorKey: "payment_method",
        cell: ({ row }) => <span className="text-sm capitalize">{row.original.payment_method || "—"}</span>,
      },
      {
        id: "reference_number",
        header: "Referencia",
        accessorKey: "reference_number",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reference_number || "—"}</span>
        ),
      },
      {
        id: "amount",
        header: "Monto",
        accessorFn: (p) => Number(p.amount),
        meta: { align: "right" },
        cell: ({ row }) => <span className="font-mono">{formatCurrency(Number(row.original.amount))}</span>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPayment(row.original)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useLiftgoTable<Payment>({
    data: payments,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "payment_date", desc: true }],
    paginated: false,
  });

  return (
    <>
      {totalPaid > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pagado</p>
                <p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                <p className={`text-lg font-mono font-bold ${balance <= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(balance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTableV2 table={table} emptyMessage="Sin pagos registrados" />
          </CardContent>
        </Card>
      )}

      {editingPayment && (
        <EditPaymentDialog
          open={!!editingPayment}
          onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
          payment={editingPayment}
        />
      )}
    </>
  );
}
