import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/formatCurrency";
import { EditPaymentDialog } from "./EditPaymentDialog";
import { usePaymentHistoryColumns } from "@/features/invoices/hooks/invoices/usePaymentHistoryColumns";
import type { Tables } from "@/integrations/supabase/types";

type Payment = Tables<"payments">;

interface Props {
  totalPaid: number;
  balance: number;
  payments: Payment[];
  /** Si la factura padre es PPD timbrada (muestra capacidades REP). */
  ppdStamped?: boolean;
  creditedAmount?: number;
}

export function InvoicePaymentSummary({
  totalPaid, balance, payments, ppdStamped = false, creditedAmount = 0,
}: Props) {
  const { columns, editingPayment, setEditingPayment } = usePaymentHistoryColumns(ppdStamped);

  const table = useLiftgoTable<Payment>({
    data: payments,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "payment_date", desc: true }],
    paginated: false,
  });

  const pendingReps = ppdStamped
    ? payments.filter((p) => {
        const s = (p.rep_cfdi_status as string | null) ?? "none";
        return s === "none" || s === "error";
      }).length
    : 0;

  return (
    <>
      {(totalPaid > 0 || creditedAmount > 0) && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pagado</p>
                <p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              {creditedAmount > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Notas de Crédito</p>
                  <p className="text-lg font-mono font-bold text-blue-600">−{formatCurrency(creditedAmount)}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
                <p className={`text-lg font-mono font-bold ${balance <= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(balance)}</p>
              </div>
            </div>
            {pendingReps > 0 && (
              <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-xs text-amber-800 dark:text-amber-200">
                ⚠️ {pendingReps} {pendingReps === 1 ? "pago" : "pagos"} sin Complemento de Pago (REP) timbrado.
              </div>
            )}
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
