import { useState } from "react";

import { ExternalLink, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useUserRole } from "@/features/users";
import { PAYMENT_METHOD_LABELS } from "../lib/supplierBillConstants";
import { UploadSupplierRepDialog } from "./UploadSupplierRepDialog";
import { ReconciliationBadge } from "@/features/bank-reconciliation";
import { useRejectSupplierRep, useResetSupplierRep } from "../hooks/useSupplierRepMutations";
import { SupplierPaymentRepSection } from "./SupplierPaymentRepSection";
import { SupplierPaymentRejectDialog } from "./SupplierPaymentRejectDialog";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface Props {
  payment: SupplierPayment;
  billId: string;
  currency: string;
}

export function SupplierPaymentRow({ payment: p, billId, currency }: Props) {
  const { data: role } = useUserRole();
  const canAct = role === "admin" || role === "administrativo";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const reject = useRejectSupplierRep();
  const reset = useResetSupplierRep();
  const repStatus = (p.rep_status as SupplierRepStatus | null) ?? "not_required";

  const confirmReject = () => {
    const notes = rejectNotes.trim();
    if (!notes) return;
    reject.mutate({ paymentId: p.id, notes, billId }, {
      onSuccess: () => { setRejectOpen(false); setRejectNotes(""); },
    });
  };

  const confirmReset = () => {
    reset.mutate({ paymentId: p.id, billId }, {
      onSuccess: () => setResetOpen(false),
    });
  };

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

      {(reject.isPending || reset.isPending) && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
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
    </div>
  );
}
