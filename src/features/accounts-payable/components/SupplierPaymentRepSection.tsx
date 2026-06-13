import { Button } from "@/components/ui/button";
import { ExternalLink, Upload, X, RotateCcw } from "lucide-react";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { formatDateDisplay } from "@/lib/utils";
import { SupplierRepStatusBadge } from "./SupplierRepStatusBadge";
import type { SupplierPayment } from "../hooks/useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

const BUCKET = "cfdi-files";

interface Props {
  payment: SupplierPayment;
  repStatus: SupplierRepStatus;
  canAct: boolean;
  rejectPending: boolean;
  resetPending: boolean;
  onUpload: () => void;
  onReject: () => void;
  onReset: () => void;
}

export function SupplierPaymentRepSection({
  payment: p, repStatus, canAct,
  rejectPending, resetPending, onUpload, onReject, onReset,
}: Props) {
  const showUpload = canAct && (repStatus === "pending" || repStatus === "rejected");
  const uploadLabel = repStatus === "rejected" ? "Reintentar" : "Cargar REP";

  return (
    <div className="pt-1 border-t mt-1 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <SupplierRepStatusBadge status={repStatus} />
        {showUpload && (
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={onUpload}>
            <Upload className="h-3 w-3 mr-1" /> {uploadLabel}
          </Button>
        )}
      </div>

      {repStatus === "received" && (
        <div className="space-y-0.5">
          {p.rep_cfdi_uuid && (
            <p className="text-muted-foreground">UUID: <span className="font-mono">{p.rep_cfdi_uuid}</span></p>
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
                  disabled={rejectPending} onClick={onReject}>
                  <X className="h-3 w-3 mr-1" /> Rechazar
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                  disabled={resetPending} onClick={onReset}>
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
  );
}
