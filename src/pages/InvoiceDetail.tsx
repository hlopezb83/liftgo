import { useParams } from "react-router-dom";
import { useInvoice } from "@/hooks/useInvoices";
import { useBooking } from "@/hooks/useBookings";
import { usePayments } from "@/hooks/usePayments";
import { useQuote } from "@/hooks/useQuotes";
import { useUserRole } from "@/hooks/useUserRole";
import { useInvoiceDetailActions } from "@/hooks/invoiceDetail/useInvoiceDetailActions";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { RecordPaymentDialog } from "@/components/invoices/RecordPaymentDialog";
import { InvoiceFiscalDataCard } from "@/components/invoice-detail/InvoiceFiscalDataCard";
import { InvoicePaymentSummary } from "@/components/invoice-detail/InvoicePaymentSummary";
import { CancelCfdiDialog } from "@/components/invoice-detail/CancelCfdiDialog";
import { CollectionNotesCard } from "@/components/invoice-detail/CollectionNotesCard";
import { InvoiceDetailActions } from "@/components/invoice-detail/InvoiceDetailActions";
import { InvoiceSourceLinks } from "@/components/invoice-detail/InvoiceSourceLinks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesCard } from "@/components/NotesCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatDateDisplay } from "@/lib/utils";
import type { LineItem } from "@/lib/invoiceUtils";

const cfdiBadgeClass = (status: string) =>
  status === "stamped"
    ? "bg-status-available text-white border-transparent"
    : status === "cancelled"
    ? "bg-destructive text-destructive-foreground border-transparent"
    : "bg-status-maintenance text-white border-transparent";

const cfdiBadgeLabel = (status: string) =>
  status === "pending" ? "Pendiente CFDI" : status === "stamped" ? "Timbrado" : status === "cancelled" ? "CFDI Cancelado" : status;

export default function InvoiceDetail() {
  const { id } = useParams();
  const { data: invoice, isLoading, refetch } = useInvoice(id);
  const { data: payments } = usePayments(id);
  const { data: userRole } = useUserRole();
  const { data: sourceQuote } = useQuote(invoice?.quote_id || undefined);
  const { data: sourceBooking } = useBooking(invoice?.booking_id || undefined);

  const actions = useInvoiceDetailActions(invoice, refetch);

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!invoice) return <div className="p-6 text-muted-foreground">Factura no encontrada</div>;

  const lineItems = (invoice.line_items as unknown as LineItem[]) || [];
  const cfdiStatus = invoice.cfdi_status || "pending";
  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = Number(invoice.total) - totalPaid;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={invoice.invoice_number}
        backTo="/invoices"
        badges={
          <>
            <StatusBadge status={invoice.status} />
            <Badge className={cfdiBadgeClass(cfdiStatus)}>{cfdiBadgeLabel(cfdiStatus)}</Badge>
          </>
        }
        actions={
          <InvoiceDetailActions
            invoice={invoice}
            cfdiStatus={cfdiStatus}
            userRole={userRole}
            paidDate={actions.paidDate}
            setPaidDate={actions.setPaidDate}
            paidPopoverOpen={actions.paidPopoverOpen}
            setPaidPopoverOpen={actions.setPaidPopoverOpen}
            isStamping={actions.stampCfdi.isPending}
            onSent={() => actions.setStatus("sent")}
            onConfirmPaid={actions.confirmPaidWithDate}
            onOpenPayment={() => actions.setPaymentDialogOpen(true)}
            onEdit={actions.handleEdit}
            onStamp={actions.handleStamp}
            onDownloadXml={actions.handleDownloadXml}
            onCancelCfdi={() => actions.setCancelDialogOpen(true)}
            onDelete={() => actions.setDeleteDialogOpen(true)}
          />
        }
      />

      {invoice.cfdi_uuid && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">UUID CFDI</p>
            <p className="font-mono text-sm">{invoice.cfdi_uuid}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{invoice.customer_name || "—"}</p>
            {invoice.receptor_rfc && <p><span className="text-muted-foreground">RFC:</span> {invoice.receptor_rfc}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Emitida:</span> {formatDateDisplay(invoice.issued_at)}</p>
            <p><span className="text-muted-foreground">Vencimiento:</span> {formatDateDisplay(invoice.due_date)}</p>
            {invoice.paid_at && <p><span className="text-muted-foreground">Pagada:</span> {formatDateDisplay(invoice.paid_at)}</p>}
          </CardContent>
        </Card>
      </div>

      <InvoiceSourceLinks sourceQuote={sourceQuote} sourceBooking={sourceBooking} />

      <InvoiceFiscalDataCard invoice={invoice} />
      <ReadOnlyLineItemsTable lineItems={lineItems} />
      <TotalsSummary subtotal={Number(invoice.subtotal)} taxRate={Number(invoice.tax_rate)} taxAmount={Number(invoice.tax_amount)} total={Number(invoice.total)} />

      {invoice.notes && <NotesCard value={invoice.notes} readOnly />}

      <InvoicePaymentSummary totalPaid={totalPaid} balance={balance} payments={payments || []} />

      {id && invoice.status !== "paid" && invoice.status !== "draft" && (
        <CollectionNotesCard invoiceId={id} />
      )}

      {id && <RecordPaymentDialog open={actions.paymentDialogOpen} onOpenChange={actions.setPaymentDialogOpen} invoiceId={id} balance={balance} />}
      {id && <CancelCfdiDialog open={actions.cancelDialogOpen} onOpenChange={actions.setCancelDialogOpen} invoiceId={id} invoiceTotal={Number(invoice.total)} onSuccess={refetch} />}

      <AlertDialog open={actions.deleteDialogOpen} onOpenChange={actions.setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura {invoice.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará la factura y sus datos asociados permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={actions.handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
