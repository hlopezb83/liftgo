import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleGuard } from "@/layouts/RoleGuard";
import { InvoicePDFButton } from "@/features/invoices/components/invoices/InvoicePDFButton";
import { Send, CheckCircle, Edit, Stamp, XCircle, Download, DollarSign, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  invoice: Tables<"invoices">;
  cfdiStatus: string;
  userRole: string | undefined;
  paidDate: Date;
  setPaidDate: (d: Date) => void;
  paidPopoverOpen: boolean;
  setPaidPopoverOpen: (v: boolean) => void;
  isStamping: boolean;
  onSent: () => void;
  onConfirmPaid: () => void;
  onOpenPayment: () => void;
  onEdit: () => void;
  onStamp: () => void;
  onDownloadXml: () => void;
  onCancelCfdi: () => void;
  onDelete: () => void;
}

export function InvoiceDetailActions({
  invoice, cfdiStatus, userRole, paidDate, setPaidDate, paidPopoverOpen, setPaidPopoverOpen,
  isStamping, onSent, onConfirmPaid, onOpenPayment, onEdit, onStamp, onDownloadXml, onCancelCfdi, onDelete,
}: Props) {
  const status = invoice.status;
  const isDraft = status === "draft";
  const isPayable = status === "sent" || status === "overdue";
  const showPaymentBtn = isPayable || status === "partial";
  const canEdit = isDraft || userRole === "admin";
  const canStamp = cfdiStatus === "pending" && !isDraft;
  const isStamped = cfdiStatus === "stamped";

  return (
    <>
      {isDraft && (
        <Button size="sm" onClick={onSent}><Send className="h-4 w-4 mr-1" />Marcar Enviada</Button>
      )}
      {isPayable && (
        <Popover open={paidPopoverOpen} onOpenChange={setPaidPopoverOpen}>
          <PopoverTrigger asChild>
            <Button size="sm"><CheckCircle className="h-4 w-4 mr-1" />Marcar Pagada</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 space-y-3" align="start">
            <p className="text-sm font-medium">Fecha de pago</p>
            <Calendar
              mode="single"
              selected={paidDate}
              onSelect={(d) => { if (d) setPaidDate(d); }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
            <Button size="sm" className="w-full" onClick={onConfirmPaid}>Confirmar</Button>
          </PopoverContent>
        </Popover>
      )}
      {showPaymentBtn && (
        <Button variant="outline" size="sm" onClick={onOpenPayment}>
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
      <InvoicePDFButton invoiceId={invoice.id} />
    </>
  );
}
