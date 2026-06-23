import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleGuard } from "@/layouts/RoleGuard";
import { InvoicePDFButton } from "../invoices/InvoicePDFButton";
import { Edit, Stamp, XCircle, Download, DollarSign, MoreHorizontal, Trash2, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useRefreshCancellationStatus } from "../../hooks/invoices/cfdi/useRefreshCancellationStatus";

interface Props {
  invoice: Tables<"invoices">;
  cfdiStatus: string;
  userRole: string | undefined;
  isStamping: boolean;
  onOpenPayment: () => void;
  onEdit: () => void;
  onStamp: () => void;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
  onDelete: () => void;
}

interface Flags {
  isDraft: boolean;
  isPayable: boolean;
  showPaymentBtn: boolean;
  canEdit: boolean;
  canStamp: boolean;
  isStamped: boolean;
  isPendingCancel: boolean;
  isRejectedCancel: boolean;
}

function computeFlags(invoice: Tables<"invoices">, cfdiStatus: string, userRole?: string): Flags {
  const status = invoice.status;
  const isDraft = status === "draft";
  const isPayable = status === "sent" || status === "overdue";
  const cancellationStatus = (invoice as unknown as { cancellation_status?: string }).cancellation_status ?? "none";
  return {
    isDraft,
    isPayable,
    showPaymentBtn: isPayable || status === "partial",
    canEdit: isDraft || userRole === "admin",
    canStamp: (cfdiStatus === "pending" || cfdiStatus === "error") && status !== "cancelled",
    isStamped: cfdiStatus === "stamped",
    isPendingCancel: cancellationStatus === "pending",
    isRejectedCancel: cancellationStatus === "rejected",
  };
}

function CancellationBlock({ flags, invoiceId }: { flags: Flags; invoiceId: string }) {
  const refresh = useRefreshCancellationStatus();
  if (!flags.isPendingCancel && !flags.isRejectedCancel) return null;
  return (
    <>
      {flags.isPendingCancel && (
        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
          Cancelación pendiente SAT
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

interface MenuProps {
  flags: Flags;
  isStamping: boolean;
  onEdit: () => void;
  onStamp: () => void;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
  onDelete: () => void;
}

function ActionsMenu({ flags, isStamping, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete }: MenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm"><MoreHorizontal className="h-4 w-4 mr-1" /> Acciones</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {flags.canEdit && (
          <DropdownMenuItem onClick={onEdit}><Edit className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
        )}
        {flags.canStamp && (
          <DropdownMenuItem onClick={onStamp} disabled={isStamping}>
            <Stamp className="h-4 w-4 mr-2" /> {isStamping ? "Timbrando..." : "Timbrar CFDI"}
          </DropdownMenuItem>
        )}
        {flags.isStamped && (
          <>
            <DropdownMenuItem onClick={onDownloadXml}><Download className="h-4 w-4 mr-2" /> Descargar XML</DropdownMenuItem>
            {!flags.isPendingCancel && (
              <DropdownMenuItem onClick={onCancelCfdi} className="text-destructive focus:text-destructive">
                <XCircle className="h-4 w-4 mr-2" /> Cancelar CFDI
              </DropdownMenuItem>
            )}
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
  );
}

export function InvoiceDetailActions({
  invoice, cfdiStatus, userRole,
  isStamping, onSent, onOpenPayment, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete,
}: Props) {
  const flags = computeFlags(invoice, cfdiStatus, userRole);
  return (
    <>
      <CancellationBlock flags={flags} invoiceId={invoice.id} />
      {flags.isDraft && (
        <Button size="sm" onClick={onSent}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
      )}
      {flags.showPaymentBtn && (
        <Button size="sm" onClick={onOpenPayment}>
          <DollarSign className="h-4 w-4 mr-1" />Registrar Pago
        </Button>
      )}
      <ActionsMenu
        flags={flags} isStamping={isStamping}
        onEdit={onEdit} onStamp={onStamp} onDownloadXml={onDownloadXml}
        onCancelCfdi={onCancelCfdi} onDelete={onDelete}
      />
      <InvoicePDFButton invoiceId={invoice.id} cfdiStatus={cfdiStatus} invoiceNumber={invoice.invoice_number} />
    </>
  );
}
