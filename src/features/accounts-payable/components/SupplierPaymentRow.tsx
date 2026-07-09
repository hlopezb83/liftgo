import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useUserRole } from "@/features/users";
import { PAYMENT_METHOD_LABELS } from "../lib/supplierBillConstants";
import { UploadSupplierRepDialog } from "./UploadSupplierRepDialog";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import { useReconciliationStatus } from "@/features/bank-reconciliation/hooks/useReconciliationStatus";
import { useRejectSupplierRep, useResetSupplierRep } from "../hooks/useSupplierRepMutations";
import { useDeleteSupplierPayment } from "../hooks/useDeleteSupplierPayment";
import { SupplierPaymentRepSection } from "./SupplierPaymentRepSection";
import { SupplierPaymentRejectDialog } from "./SupplierPaymentRejectDialog";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface Props {
  payment: SupplierPayment;
  billId: string;
  currency: string;
  billCancelled?: boolean;
}

export function SupplierPaymentRow({ payment: p, billId, currency, billCancelled = false }: Props) {
  const { data: role } = useUserRole();
  const canAct = role === "admin" || role === "administrativo";
  const isAdmin = role === "admin";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const reject = useRejectSupplierRep();
  const reset = useResetSupplierRep();
  const deletePayment = useDeleteSupplierPayment();
  const { data: reconciliation } = useReconciliationStatus({ supplierPaymentId: p.id });
  const repStatus = (p.rep_status as SupplierRepStatus | null) ?? "not_required";

  const deleteBlocked =
    repStatus === "received" ? "Revierte primero el REP fiscal recibido" :
    billCancelled ? "La factura está cancelada" : null;
  const canDelete = isAdmin && !deleteBlocked;

  const confirmReject = (notes: string) => {
    reject.mutate({ paymentId: p.id, notes, billId }, {
      onSuccess: () => setRejectOpen(false),
    });
  };

  const confirmReset = () => {
    reset.mutate({ paymentId: p.id, billId }, {
      onSuccess: () => setResetOpen(false),
    });
  };

  const confirmDelete = () => {
    deletePayment.mutate({ paymentId: p.id, billId }, {
      onSuccess: () => setDeleteOpen(false),
    });
  };

  const reconciledMsg = reconciliation
    ? ` Este pago está conciliado con ${reconciliation.bank_account_name}${reconciliation.bank_last4 ? ` ····${reconciliation.bank_last4}` : ""} el ${formatDateDisplay(reconciliation.matched_at)}; al eliminarlo, esa línea bancaria volverá a quedar sin conciliar.`
    : "";

  return (
    <div className="rounded-md border p-2 text-xs space-y-1">
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
          Comprobante <ExternalLink className="h-3 w-3" />
        </a>
      )}

      <SupplierPaymentRepSection
        payment={p}
        repStatus={repStatus}
        canAct={canAct}
        rejectPending={reject.isPending}
        resetPending={reset.isPending}
        onUpload={() => setUploadOpen(true)}
        onReject={() => setRejectOpen(true)}
        onReset={() => setResetOpen(true)}
      />

      {(reject.isPending || reset.isPending || deletePayment.isPending) && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}

      {isAdmin && (
        <div className="pt-1 flex justify-end">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={!canDelete || deletePayment.isPending}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Eliminar pago
                  </Button>
                </span>
              </TooltipTrigger>
              {deleteBlocked && <TooltipContent>{deleteBlocked}</TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      <UploadSupplierRepDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        paymentId={p.id}
        billId={billId}
        paymentAmountLabel={formatCurrencyWithCode(Number(p.amount), currency)}
      />

      <SupplierPaymentRejectDialog
        open={rejectOpen}
        onOpenChange={(o) => { setRejectOpen(o); if (!o) setRejectNotes(""); }}
        notes={rejectNotes}
        onNotesChange={setRejectNotes}
        onConfirm={confirmReject}
        pending={reject.isPending}
        inputId={`reject-notes-${p.id}`}
      />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reiniciar REP"
        description="Esto regresa el REP a pendiente y borra los archivos cargados. ¿Continuar?"
        confirmLabel="Reiniciar"
        destructive
        onConfirm={confirmReset}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Eliminar pago de ${formatCurrencyWithCode(Number(p.amount), currency)}`}
        description={`Esta acción es irreversible. El saldo y estado de la factura se recalcularán automáticamente.${reconciledMsg}`}
        confirmLabel="Eliminar pago"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
