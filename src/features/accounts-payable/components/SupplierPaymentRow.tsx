import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Upload, X, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { PAYMENT_METHOD_LABELS } from "../lib/supplierBillConstants";
import { SupplierRepStatusBadge } from "./SupplierRepStatusBadge";
import { UploadSupplierRepDialog } from "./UploadSupplierRepDialog";
import { useRejectSupplierRep, useResetSupplierRep } from "../hooks/useSupplierRepMutations";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface Props {
  payment: SupplierPayment;
  billId: string;
  currency: string;
}

const BUCKET = "cfdi-files";

async function openSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error("No se pudo abrir el archivo");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

export function SupplierPaymentRow({ payment: p, billId, currency }: Props) {
  const { data: role } = useUserRole();
  const canAct = role === "admin" || role === "administrativo";

  const [uploadOpen, setUploadOpen] = useState(false);
  const reject = useRejectSupplierRep();
  const reset = useResetSupplierRep();
  const repStatus = (p.rep_status as SupplierRepStatus | null) ?? "not_required";

  const handleReject = () => {
    const notes = window.prompt("Motivo del rechazo del REP:")?.trim();
    if (!notes) return;
    reject.mutate({ paymentId: p.id, notes, billId });
  };
  const handleReset = () => {
    if (!window.confirm("¿Reiniciar el REP a pendiente y borrar archivos cargados?")) return;
    reset.mutate({ paymentId: p.id, billId });
  };

  return (
    <div className="rounded-md border p-2 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-medium">{formatDateDisplay(p.payment_date)}</span>
        <span className="font-mono font-bold">{formatCurrencyWithCode(Number(p.amount), currency)}</span>
      </div>
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
                <button type="button" onClick={() => openSignedUrl(p.rep_xml_url as string)}
                  className="text-primary inline-flex items-center gap-1 hover:underline">
                  XML <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {p.rep_pdf_url && (
                <button type="button" onClick={() => openSignedUrl(p.rep_pdf_url as string)}
                  className="text-primary inline-flex items-center gap-1 hover:underline">
                  PDF <ExternalLink className="h-3 w-3" />
                </button>
              )}
              {canAct && (
                <>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive"
                    disabled={reject.isPending} onClick={handleReject}>
                    <X className="h-3 w-3 mr-1" /> Rechazar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                    disabled={reset.isPending} onClick={handleReset}>
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
    </div>
  );
}
