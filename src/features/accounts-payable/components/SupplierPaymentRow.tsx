import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Upload, X, RotateCcw, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { PAYMENT_METHOD_LABELS } from "../lib/supplierBillConstants";
import { SupplierRepStatusBadge } from "./SupplierRepStatusBadge";
import { UploadSupplierRepDialog } from "./UploadSupplierRepDialog";
import { ReconciliationBadge } from "@/features/bank-reconciliation/components/ReconciliationBadge";
import { useRejectSupplierRep, useResetSupplierRep } from "../hooks/useSupplierRepMutations";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface Props {
  payment: SupplierPayment;
  billId: string;
  currency: string;
}

const BUCKET = "cfdi-files";

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

      <div className="pt-1 border-t mt-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <SupplierRepStatusBadge status={repStatus} />
          {repStatus === "pending" && canAct && (
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3 w-3 mr-1" /> Cargar REP
            </Button>
          )}
          {repStatus === "rejected" && canAct && (
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3 w-3 mr-1" /> Reintentar
            </Button>
          )}
        </div>

        {repStatus === "received" && (
          <div className="space-y-0.5">
            {p.rep_cfdi_uuid && (
              <p className="text-muted-foreground">
                UUID: <span className="font-mono">{p.rep_cfdi_uuid}</span>
              </p>
            )}
            {p.rep_received_at && (
              <p className="text-muted-foreground">Recibido: {formatDateDisplay(p.rep_received_at)}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {p.rep_xml_url && (
                <button type="button" onClick={() => openStorageFile(BUCKET, p.rep_xml_url as string)}
                  className="text-primary inline-flex items-center gap-1 hover:underline">
                  XML <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {p.rep_pdf_url && (
                <button type="button" onClick={() => openStorageFile(BUCKET, p.rep_pdf_url as string)}
                  className="text-primary inline-flex items-center gap-1 hover:underline">
                  PDF <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {canAct && (
                <>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive"
                    disabled={reject.isPending} onClick={() => setRejectOpen(true)}>
                    <X className="h-3 w-3 mr-1" /> Rechazar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                    disabled={reset.isPending} onClick={() => setResetOpen(true)}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Reiniciar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {repStatus === "rejected" && p.rep_notes && (
          <p className="text-destructive">Motivo: {p.rep_notes}</p>
        )}
      </div>

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

      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) setRejectNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar REP</DialogTitle>
            <DialogDescription>Indica el motivo del rechazo del complemento de pago.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-notes-${p.id}`}>Motivo</Label>
            <Textarea
              id={`reject-notes-${p.id}`}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Ej. UUID no corresponde a la factura"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectNotes.trim() || reject.isPending}
              onClick={confirmReject}
            >
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
