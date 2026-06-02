import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleGuard } from "@/layouts/RoleGuard";
import { InvoicePDFButton } from "@/features/invoices/components/invoices/InvoicePDFButton";
import { Send, Edit, Stamp, XCircle, Download, DollarSign, MoreHorizontal, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  invoice: Tables<"invoices">;
  cfdiStatus: string;
  userRole: string | undefined;
  isStamping: boolean;
  onSent: () => void;
  onOpenPayment: () => void;
  onEdit: () => void;
  onStamp: () => void;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
  onDelete: () => void;
}

export function InvoiceDetailActions({
  invoice, cfdiStatus, userRole,
  isStamping, onSent, onOpenPayment, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete,
}: Props) {
  const status = invoice.status;
  const isDraft = status === "draft";
  const isPayable = status === "sent" || status === "overdue";
  const showPaymentBtn = isPayable || status === "partial";
  const canEdit = isDraft || userRole === "admin";
  const canStamp = (cfdiStatus === "pending" || cfdiStatus === "error") && !isDraft;
  const isStamped = cfdiStatus === "stamped";

  return (
    <>
      {isDraft && (
        <Button size="sm" onClick={onSent}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
      )}
      {showPaymentBtn && (
        <Button size="sm" onClick={onOpenPayment}>
          <DollarSign className="h-4 w-4 mr-1" />Registrar Pago
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4 mr-1" /> Acciones</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={onEdit}><Edit className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
          )}
          {canStamp && (
            <DropdownMenuItem onClick={onStamp} disabled={isStamping}>
              <Stamp className="h-4 w-4 mr-2" /> {isStamping ? "Timbrando..." : "Timbrar CFDI"}
            </DropdownMenuItem>
          )}
          {isStamped && (
            <>
              <DropdownMenuItem onClick={onDownloadXml}><Download className="h-4 w-4 mr-2" /> Descargar XML</DropdownMenuItem>
              <DropdownMenuItem onClick={onCancelCfdi} className="text-destructive focus:text-destructive">
                <XCircle className="h-4 w-4 mr-2" /> Cancelar CFDI
              </DropdownMenuItem>
            </>
          )}
          <RoleGuard module="Facturas" minAccess="full">
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
            </DropdownMenuItem>
          </RoleGuard>
        </DropdownMenuContent>
      </DropdownMenu>
      <InvoicePDFButton invoiceId={invoice.id} cfdiStatus={cfdiStatus} invoiceNumber={invoice.invoice_number} />
    </>
  );
}
