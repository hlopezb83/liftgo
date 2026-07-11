import { Button } from "@/components/ui/button";
import { OpenLinkIcon, X, ResetIcon } from "@/components/icons";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { formatDateDisplay } from "@/lib/utils";
import type { SupplierPayment } from "../hooks/useSupplierBill";

const BUCKET = "cfdi-files";

interface Props {
  payment: SupplierPayment;
  canAct: boolean;
  rejectPending: boolean;
  resetPending: boolean;
  onReject: () => void;
  onReset: () => void;
}

export function SupplierPaymentRepReceived({
  payment: p, canAct, rejectPending, resetPending, onReject, onReset,
}: Props) {
  return (
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
            XML <OpenLinkIcon className="h-3 w-3" />
          </button>
        )}
        {p.rep_pdf_url && (
          <button type="button" onClick={() => openStorageFile(BUCKET, p.rep_pdf_url as string)}
            className="text-primary inline-flex items-center gap-1 hover:underline">
            PDF <OpenLinkIcon className="h-3 w-3" />
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
              <ResetIcon className="h-3 w-3 mr-1" /> Reiniciar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
