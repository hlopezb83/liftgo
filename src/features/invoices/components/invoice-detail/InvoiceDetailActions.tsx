import { useState } from "react";
import { EditIcon, StampIcon, ErrorIcon, PaymentIcon, DeleteIcon, RefreshIcon, DocumentIcon, FileCode2 } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/integrations/supabase/types";
import { RoleGuard } from "@/layouts/RoleGuard";
import { computeInvoiceFlags, type InvoiceActionFlags } from "@/lib/rules/invoices";
import { notifyError } from "@/lib/ui/appFeedback";
import { useRefreshCancellationStatus } from "../../hooks/invoices/cfdi/useRefreshCancellationStatus";
import { downloadCfdiBlob } from "../../lib/downloadCfdiBlob";
import { InvoicePDFButton } from "../invoices/InvoicePDFButton";
import type { InvoiceVisibility } from "../../lib/invoiceVisibility";

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
        <RefreshIcon className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
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
        <DocumentIcon className="h-4 w-4 mr-1" />
        {loading === "pdf" ? "Descargando…" : "Acuse PDF"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle("acuse_xml")} disabled={loading !== null}>
        <FileCode2 className="h-4 w-4 mr-1" />
        {loading === "xml" ? "Descargando…" : "Acuse XML"}
      </Button>
    </>
  );
}



function resolvePdfMode(visibility: InvoiceVisibility): "draft" | "cfdi" | "hidden" {
  if (visibility.showCfdiPdf) return "cfdi";
  if (visibility.showDraftPdf) return "draft";
  return "hidden";
}

function StampButtons({ flags, isStamping, onStamp }: { flags: Flags; isStamping: boolean; onStamp: () => void }) {
  if (!flags.canStamp) return null;
  const label = isStamping ? "Timbrando..." : "Timbrar CFDI";
  const variant = flags.isDraft ? undefined : "outline";
  return (
    <Button size="sm" variant={variant} onClick={onStamp} disabled={isStamping}>
      <StampIcon className="h-4 w-4 mr-1" /> {label}
    </Button>
  );
}

function CfdiXmlActions({
  invoice,
  visibility,
  flags,
  onDownloadXml,
  onCancelCfdi,
}: {
  invoice: Tables<"invoices">;
  visibility: InvoiceVisibility;
  flags: Flags;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
}) {
  return (
    <>
      {visibility.showCfdiXml ? (
        <Button size="sm" variant="outline" onClick={onDownloadXml}>
          <FileCode2 className="h-4 w-4 mr-1" /> CFDI XML
        </Button>
      ) : null}
      {visibility.showAcuseButtons ? (
        <AcuseDownloadButtons invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
      ) : null}
      {flags.canCancelCfdi ? (
        <RoleGuard module="Facturas" minAccess="full">
          <Button
            size="sm"
            variant="outline"
            onClick={onCancelCfdi}
            className="text-destructive hover:text-destructive"
          >
            <ErrorIcon className="h-4 w-4 mr-1" /> Cancelar CFDI
          </Button>
        </RoleGuard>
      ) : null}
    </>
  );
}

export function InvoiceDetailActions({
  invoice, cfdiStatus, userRole: _userRole, visibility,
  isStamping, onOpenPayment, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete,
}: Props) {
  const flags = computeInvoiceFlags(invoice, cfdiStatus, null);
  const pdfMode = resolvePdfMode(visibility);
  return (
    <>
      <CancellationBlock flags={flags} invoiceId={invoice.id} />
      {flags.canEdit ? (
        <RoleGuard module="Facturas" minAccess="full">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <EditIcon className="h-4 w-4 mr-1" /> Editar
          </Button>
        </RoleGuard>
      ) : null}
      <RoleGuard module="Facturas" minAccess="full">
        <StampButtons flags={flags} isStamping={isStamping} onStamp={onStamp} />
      </RoleGuard>
      {flags.showPaymentBtn ? (
        <RoleGuard module="Facturas" minAccess="full">
          <Button size="sm" onClick={onOpenPayment}>
            <PaymentIcon className="h-4 w-4 mr-1" />Registrar Pago
          </Button>
        </RoleGuard>
      ) : null}
      {pdfMode !== "hidden" ? (
        <InvoicePDFButton
          invoiceId={invoice.id}
          mode={pdfMode}
          invoiceNumber={invoice.invoice_number}
        />
      ) : null}
      <CfdiXmlActions
        invoice={invoice}
        visibility={visibility}
        flags={flags}
        onDownloadXml={onDownloadXml}
        onCancelCfdi={onCancelCfdi}
      />
      {flags.canDelete ? (
        <RoleGuard module="Facturas" minAccess="full">
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
          </Button>
        </RoleGuard>
      ) : null}
    </>
  );
}
