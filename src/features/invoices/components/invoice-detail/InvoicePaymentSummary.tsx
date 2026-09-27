import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { usePaymentHistoryColumns } from "../../hooks/invoices/usePaymentHistoryColumns";
import { CancelRepDialog } from "./CancelRepDialog";
import { EditPaymentDialog } from "./EditPaymentDialog";

type Payment = Tables<"payments">;

interface Props {
  totalPaid: number;
  balance: number;
  payments: Payment[];
  /** Si la factura padre es PPD timbrada (muestra capacidades REP). */
  ppdStamped?: boolean;
  /** Permitir Timbrar/Cancelar REP (false si la factura padre está cancelada). */
  allowRepMutations?: boolean;
  creditedAmount?: number;
  currency?: string;
}

function countPendingReps(payments: Payment[]): number {
  return payments.filter((p) => {
    const s = (p.rep_cfdi_status as string | null) ?? "none";
    return s === "none" || s === "error";
  }).length;
}

function PaymentSummaryCard({
  totalPaid,
  balance,
  creditedAmount,
  pendingReps,
  currency,
}: {
  totalPaid: number;
  balance: number;
  creditedAmount: number;
  pendingReps: number;
  currency: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className={`grid gap-4 ${creditedAmount > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div>
            <p className="text-sm text-muted-foreground">Total Pagado</p>
            <p className="text-lg font-bold tabular-nums text-success">{formatCurrencyWithCode(totalPaid, currency)}</p>
          </div>
          {creditedAmount > 0 ? (
            <div>
              <p className="text-sm text-muted-foreground">Notas de Crédito</p>
              <p className="text-lg font-bold tabular-nums text-info">−{formatCurrencyWithCode(creditedAmount, currency)}</p>
            </div>
          ) : null}
          <div className="sm:text-right">
            <p className="text-sm text-muted-foreground">Saldo Pendiente</p>
            <p className={`text-lg font-bold tabular-nums ${balance <= 0 ? "text-success" : "text-destructive"}`}>{formatCurrencyWithCode(balance, currency)}</p>
          </div>
        </div>
        {pendingReps > 0 ? (
          <div className="mt-3 rounded-md bg-warning/10 border border-warning/30 p-2 text-xs text-warning">
            ⚠️ {pendingReps} {pendingReps === 1 ? "pago" : "pagos"} sin Complemento de Pago (REP) timbrado.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function InvoicePaymentSummary({
  totalPaid, balance, payments, ppdStamped = false, allowRepMutations = ppdStamped, creditedAmount = 0, currency = "MXN",
}: Props) {
  const { columns, canWrite, editingPayment, setEditingPayment, cancelRepPaymentId, setCancelRepPaymentId } = usePaymentHistoryColumns(ppdStamped, allowRepMutations);

  const table = useLiftgoTable<Payment>({
    data: payments,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "payment_date", desc: true }],
    paginated: false,
  });

  const pendingReps = ppdStamped ? countPendingReps(payments) : 0;
  const showSummary = totalPaid > 0 || creditedAmount > 0;

  return (
    <>
      {showSummary ? (
        <PaymentSummaryCard
          totalPaid={totalPaid}
          balance={balance}
          creditedAmount={creditedAmount}
          pendingReps={pendingReps}
          currency={currency}
        />
      ) : null}

      {payments.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de Pagos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTableV2 table={table} emptyMessage="Sin pagos registrados" />
          </CardContent>
        </Card>
      ) : null}

      {canWrite && editingPayment ? (
        <EditPaymentDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditingPayment(null); }}
          payment={editingPayment}
          balance={balance}
        />
      ) : null}

      {canWrite && (
        <CancelRepDialog
          open={cancelRepPaymentId !== null}
          onOpenChange={(open) => { if (!open) setCancelRepPaymentId(null); }}
          paymentId={cancelRepPaymentId}
        />
      )}
    </>
  );
}
