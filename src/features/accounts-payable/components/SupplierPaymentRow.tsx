import { SpinnerIcon, OpenLinkIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useSupplierPaymentActions } from "../hooks/useSupplierPaymentActions";
import { PAYMENT_METHOD_LABELS } from "../lib/supplierBillConstants";
import { SupplierPaymentDeleteButton } from "./SupplierPaymentDeleteButton";
import { SupplierPaymentRejectDialog } from "./SupplierPaymentRejectDialog";
import { SupplierPaymentRepSection } from "./SupplierPaymentRepSection";
import { UploadSupplierRepDialog } from "./UploadSupplierRepDialog";
import type { SupplierPayment } from "../hooks/useSupplierBill";

interface Props {
  payment: SupplierPayment;
  billId: string;
  currency: string;
  billCancelled?: boolean;
}

function PaymentHeader({ p, currency }: { p: SupplierPayment; currency: string }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="font-medium">{formatDateDisplay(p.payment_date)}</span>
        <span className="font-mono font-bold">{formatCurrencyWithCode(Number(p.amount), currency)}</span>
      </div>
      <ReconciliationBadge supplierPaymentId={p.id} />
      <p className="text-muted-foreground">
        {p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method : "—"}
        {p.reference && <> · ref. {p.reference}</>}
        {p.bank_account && <> · {p.bank_account}</>}
      </p>
      {p.receipt_url && (
        <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
          Comprobante <OpenLinkIcon className="h-3 w-3" />
        </a>
      )}
    </>
  );
}

export function SupplierPaymentRow({ payment: p, billId, currency, billCancelled = false }: Props) {
  const a = useSupplierPaymentActions(p, billId, billCancelled);
  const anyPending = a.reject.isPending || a.reset.isPending || a.deletePayment.isPending;

  return (
    <div className="rounded-md border p-2 text-xs space-y-1">
      <PaymentHeader p={p} currency={currency} />

      <SupplierPaymentRepSection
        payment={p}
        repStatus={a.repStatus}
        canAct={a.canAct}
        rejectPending={a.reject.isPending}
        resetPending={a.reset.isPending}
        onUpload={() => a.setUploadOpen(true)}
        onReject={() => a.setRejectOpen(true)}
        onReset={() => a.setResetOpen(true)}
      />

      {anyPending && <SpinnerIcon className="h-3 w-3 animate-spin text-muted-foreground" />}

      {a.isAdmin && (
        <SupplierPaymentDeleteButton
          canDelete={a.canDelete}
          deleteBlocked={a.deleteBlocked}
          isPending={a.deletePayment.isPending}
          onClick={() => a.setDeleteOpen(true)}
        />
      )}

      <UploadSupplierRepDialog
        open={a.uploadOpen}
        onOpenChange={a.setUploadOpen}
        paymentId={p.id}
        billId={billId}
        paymentAmountLabel={formatCurrencyWithCode(Number(p.amount), currency)}
      />

      <SupplierPaymentRejectDialog
        open={a.rejectOpen}
        onOpenChange={a.setRejectOpen}
        onConfirm={a.confirmReject}
        pending={a.reject.isPending}
      />

      <ConfirmDialog
        open={a.resetOpen}
        onOpenChange={a.setResetOpen}
        title="Reiniciar REP"
        description="Esto regresa el REP a pendiente y borra los archivos cargados. ¿Continuar?"
        confirmLabel="Reiniciar"
        destructive
        onConfirm={a.confirmReset}
      />

      <ConfirmDialog
        open={a.deleteOpen}
        onOpenChange={a.setDeleteOpen}
        title={`Eliminar pago de ${formatCurrencyWithCode(Number(p.amount), currency)}`}
        description={`Esta acción es irreversible. El saldo y estado de la factura se recalcularán automáticamente.${a.reconciledMsg}`}
        confirmLabel="Eliminar pago"
        destructive
        onConfirm={a.confirmDelete}
      />


    </div>
  );
}
