import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RoleGuard } from "@/layouts/RoleGuard";
import { InvoicePDFButton } from "../invoices/InvoicePDFButton";
import { Edit, Stamp, XCircle, DollarSign, Trash2, RefreshCw, FileText, FileCode2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useRefreshCancellationStatus } from "../../hooks/invoices/cfdi/useRefreshCancellationStatus";
import { useState } from "react";
import { downloadCfdiBlob } from "../../lib/downloadCfdiBlob";
import { notifyError } from "@/lib/ui/appFeedback";


import type { InvoiceVisibility } from "../../lib/invoiceVisibility";
import { computeInvoiceFlags, type InvoiceActionFlags } from "@/lib/rules/invoices";

interface Props {
  invoice: Tables<"invoices">;
  cfdiStatus: string;
  userRole: string | undefined;
  visibility: InvoiceVisibility;
  isStamping: boolean;
  onOpenPayment: () => void;
  onEdit: () => void;
  onStamp: () => void;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
  onDelete: () => void;
}

type Flags = InvoiceActionFlags;



function CancellationBlock({ flags, invoiceId }: { flags: Flags; invoiceId: string }) {
  const refresh = useRefreshCancellationStatus();
  if (!flags.isPendingCancel && !flags.isRejectedCancel) return null;
  return (
    <>
      {flags.isPendingCancel && (
        <Badge variant="outline" className="border-warning/30 text-warning">
          Cancelación solicitada · esperando SAT
        </Badge>
      )}
      {flags.isRejectedCancel && <Badge variant="destructive">Cancelación rechazada</Badge>}
      <Button size="sm" variant="outline" onClick={() => refresh.mutate(invoiceId)} disabled={refresh.isPending}>
        <RefreshCw className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
        Actualizar estado SAT
      </Button>
    </>
  );
}

function AcuseDownloadButtons({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber?: string | null }) {
  const [loading, setLoading] = useState<"pdf" | "xml" | null>(null);
  const handle = async (fmt: "acuse_pdf" | "acuse_xml") => {
    setLoading(fmt === "acuse_pdf" ? "pdf" : "xml");
    try {
      const ext = fmt === "acuse_pdf" ? "pdf" : "xml";
      await downloadCfdiBlob({ invoice_id: invoiceId }, fmt, `Acuse-${invoiceNumber || invoiceId}.${ext}`);
    } catch (err) {
      notifyError({ error: err, message: "Error al descargar acuse" });
    } finally {
      setLoading(null);
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => handle("acuse_pdf")} disabled={loading !== null}>
        <FileText className="h-4 w-4 mr-1" />
        {loading === "pdf" ? "Descargando…" : "Acuse PDF"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle("acuse_xml")} disabled={loading !== null}>
        <FileCode2 className="h-4 w-4 mr-1" />
        {loading === "xml" ? "Descargando…" : "Acuse XML"}
      </Button>
    </>
  );
}



export function InvoiceDetailActions({
  invoice, cfdiStatus, userRole, visibility,
  isStamping, onOpenPayment, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete,
}: Props) {
  const flags = computeInvoiceFlags(invoice, cfdiStatus, null);
  const pdfMode: "draft" | "cfdi" | "hidden" = visibility.showCfdiPdf
    ? "cfdi"
    : visibility.showDraftPdf
      ? "draft"
      : "hidden";
  return (
    <>
      <CancellationBlock flags={flags} invoiceId={invoice.id} />
      {flags.canEdit && (
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-1" /> Editar
        </Button>
      )}
      {flags.isDraft && flags.canStamp && (
        <Button size="sm" onClick={onStamp} disabled={isStamping}>
          <Stamp className="h-4 w-4 mr-1" />
          {isStamping ? "Timbrando..." : "Timbrar CFDI"}
        </Button>
      )}
      {flags.canStamp && !flags.isDraft && (
        <Button size="sm" variant="outline" onClick={onStamp} disabled={isStamping}>
          <Stamp className="h-4 w-4 mr-1" /> {isStamping ? "Timbrando..." : "Timbrar CFDI"}
        </Button>
      )}
      {flags.showPaymentBtn && (
        <Button size="sm" onClick={onOpenPayment}>
          <DollarSign className="h-4 w-4 mr-1" />Registrar Pago
        </Button>
      )}
      {pdfMode !== "hidden" && (
        <InvoicePDFButton
          invoiceId={invoice.id}
          mode={pdfMode}
          invoiceNumber={invoice.invoice_number}
        />
      )}
      {visibility.showCfdiXml && (
        <Button size="sm" variant="outline" onClick={onDownloadXml}>
          <FileCode2 className="h-4 w-4 mr-1" /> CFDI XML
        </Button>
      )}
      {visibility.showAcuseButtons && (
        <AcuseDownloadButtons invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
      )}
      {cfdiStatus === "stamped" && !flags.isPendingCancel && (
        <Button
          size="sm"
          variant="outline"
          onClick={onCancelCfdi}
          className="text-destructive hover:text-destructive"
        >
          <XCircle className="h-4 w-4 mr-1" /> Cancelar CFDI
        </Button>
      )}

      {flags.canDelete && (
        <RoleGuard module="Facturas" minAccess="full">
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Eliminar
          </Button>
        </RoleGuard>
      )}
    </>
  );
}
