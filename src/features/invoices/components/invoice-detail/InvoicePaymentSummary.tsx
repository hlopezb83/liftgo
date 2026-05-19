import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { EditPaymentDialog } from "./EditPaymentDialog";
import type { Tables } from "@/integrations/supabase/types";
import {
  DataTableV2,
  useLiftgoTable,
  toColumnDefs,
  type LegacyColumn,
} from "@/components/dataTable/v2";

interface InvoicePaymentSummaryProps {
  totalPaid: number;
  balance: number;
  payments: Tables<"payments">[];
}

type Payment = Tables<"payments">;

export function InvoicePaymentSummary({ totalPaid, balance, payments }: InvoicePaymentSummaryProps) {
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const columns = useMemo(
    () =>
      toColumnDefs<Payment>([
        { key: "payment_date", label: "Fecha", sortable: true, render: (p) => <span className="text-sm">{formatDateDisplay(p.payment_date)}</span> },
        { key: "payment_method", label: "Método", sortable: true, render: (p) => <span className="text-sm capitalize">{p.payment_method || "—"}</span> },
        { key: "reference_number", label: "Referencia", sortable: true, render: (p) => <span className="text-sm text-muted-foreground">{p.reference_number || "—"}</span> },
        { key: "amount", label: "Monto", align: "right", sortable: true, accessor: (p) => Number(p.amount), render: (p) => <span className="font-mono">{formatCurrency(Number(p.amount))}</span> },
        { key: "actions", label: "", render: (p) => (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPayment(p)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) },
      ] satisfies LegacyColumn<Payment>[]),
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
