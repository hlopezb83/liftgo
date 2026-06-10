import { useParams } from "react-router-dom";
import { useInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useBooking } from "@/features/bookings/hooks/useBookings";
import { usePayments } from "@/features/invoices/hooks/usePayments";
import { useQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { useCompanySettings } from "@/features/company-settings/hooks/useCompanySettings";
import { useInvoiceDetailActions } from "@/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { InvoiceFiscalDataCard } from "@/features/invoices/components/invoice-detail/InvoiceFiscalDataCard";
import { InvoicePaymentSummary } from "@/features/invoices/components/invoice-detail/InvoicePaymentSummary";
import { PaymentIntentsSection } from "@/features/invoices/components/invoice-detail/PaymentIntentsSection";
import { InvoiceHistoryCard } from "@/features/invoices/components/invoice-detail/InvoiceHistoryCard";
import { InvoiceDetailActions } from "@/features/invoices/components/invoice-detail/InvoiceDetailActions";
import { InvoiceSourceLinks } from "@/features/invoices/components/invoice-detail/InvoiceSourceLinks";
import { InvoiceSummaryCards } from "@/features/invoices/components/invoice-detail/InvoiceSummaryCards";
import { InvoiceDetailDialogs } from "@/features/invoices/components/invoice-detail/InvoiceDetailDialogs";
import { InvoiceCreditNotesCard } from "@/features/invoices/components/invoice-detail/InvoiceCreditNotesCard";
import { useCreditNotesForInvoice } from "@/features/invoices/hooks/creditNotes/useCreditNotes";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { LineItem } from "@/lib/domain/invoiceHelpers";

const cfdiBadgeClass = (status: string) =>
  status === "stamped"
    ? "bg-status-available text-white border-transparent"
    : status === "cancelled"
    ? "bg-destructive text-destructive-foreground border-transparent"
    : "bg-status-maintenance text-white border-transparent";

const CFDI_BADGE_LABELS: Record<string, string> = {
  pending: "Pendiente CFDI",
  stamped: "Timbrado",
  cancelled: "CFDI Cancelado",
};
const cfdiBadgeLabel = (status: string) => CFDI_BADGE_LABELS[status] ?? status;

export default function InvoiceDetail() {
  const { id } = useParams();
  const { data: invoice, isLoading, refetch } = useInvoice(id);
  const { data: payments } = usePayments(id);
  const { data: creditNotes = [] } = useCreditNotesForInvoice(id);
  const { data: userRole } = useUserRole();
  const { data: company } = useCompanySettings();
  const { data: sourceQuote } = useQuote(invoice?.quote_id ?? undefined);
  const { data: sourceBooking } = useBooking(invoice?.booking_id ?? undefined);

  const actions = useInvoiceDetailActions(invoice, refetch);

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!invoice || !id) return <div className="p-6 text-muted-foreground">Factura no encontrada</div>;

  const paymentList = payments ?? [];
  const lineItems = parseLineItems<LineItem>(invoice.line_items);
  const cfdiStatus = invoice.cfdi_status ?? "pending";
  const totalPaid = paymentList.reduce((sum, p) => sum + Number(p.amount), 0);
  const creditedAmount = creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.status !== "cancelled" && cn.cancellation_status !== "accepted")
    .reduce((s, cn) => s + Number(cn.total), 0);
  const total = Number(invoice.total);
  const balance = total - totalPaid - creditedAmount;
  const showCfdiError = Boolean(invoice.cfdi_error_message) && cfdiStatus !== "stamped";
  const showCollectionNotes = !["paid", "draft"].includes(invoice.status);
  const notes = invoice.notes;
  const pacMode = (company as { facturapi_mode?: string } | null | undefined)?.facturapi_mode ?? "test";
  const isLive = pacMode === "live";
  const showPacBadge = cfdiStatus !== "stamped";

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={invoice.invoice_number}
        backTo="/invoices"
        badges={
          <>
            <StatusBadge status={invoice.status} />
            <Badge className={cfdiBadgeClass(cfdiStatus)}>{cfdiBadgeLabel(cfdiStatus)}</Badge>
            {showPacBadge && (
              <Badge
                variant="outline"
                className={isLive
                  ? "border-status-available text-status-available"
                  : "border-status-maintenance text-status-maintenance"}
              >
                {isLive ? "PAC: Producción" : "PAC: Sandbox"}
              </Badge>
            )}
          </>
        }
        actions={
          <InvoiceDetailActions
            invoice={invoice}
            cfdiStatus={cfdiStatus}
            userRole={userRole}
            isStamping={actions.stampCfdi.isPending}
            onSent={() => actions.setStatus("sent")}
            onOpenPayment={() => actions.setPaymentDialogOpen(true)}
            onEdit={actions.handleEdit}
            onStamp={actions.handleStamp}
            onDownloadXml={actions.handleDownloadXml}
            onCancelCfdi={() => actions.setCancelDialogOpen(true)}
            onDelete={() => actions.setDeleteDialogOpen(true)}
          />
        }
      />

      <InvoiceSummaryCards
        customerName={invoice.customer_name}
        rfc={invoice.receptor_rfc}
        issuedAt={invoice.issued_at}
        dueDate={invoice.due_date}
        paidAt={invoice.paid_at}
        cfdiUuid={invoice.cfdi_uuid}
        cfdiErrorMessage={invoice.cfdi_error_message}
        showCfdiError={showCfdiError}
      />

      <InvoiceSourceLinks sourceQuote={sourceQuote} sourceBooking={sourceBooking} />
      <InvoiceFiscalDataCard invoice={invoice} />
      <ReadOnlyLineItemsTable lineItems={lineItems} />
      <TotalsSummary subtotal={Number(invoice.subtotal)} taxRate={Number(invoice.tax_rate)} taxAmount={Number(invoice.tax_amount)} total={total} />

      <InvoicePaymentSummary
        totalPaid={totalPaid}
        balance={balance}
        payments={paymentList}
        ppdStamped={invoice.metodo_pago === "PPD" && cfdiStatus === "stamped"}
        creditedAmount={creditedAmount}
      />
      {id && <PaymentIntentsSection invoiceId={id} />}
      <InvoiceCreditNotesCard invoice={invoice} totalPaid={totalPaid} />
      <InvoiceHistoryCard invoiceId={id} />

      <InvoiceDetailDialogs
        invoiceId={id}
        invoiceNumber={invoice.invoice_number}
        invoiceTotal={total}
        balance={balance}
        notes={notes}
        showCollectionNotes={showCollectionNotes}
        paymentOpen={actions.paymentDialogOpen}
        setPaymentOpen={actions.setPaymentDialogOpen}
        cancelOpen={actions.cancelDialogOpen}
        setCancelOpen={actions.setCancelDialogOpen}
        deleteOpen={actions.deleteDialogOpen}
        setDeleteOpen={actions.setDeleteDialogOpen}
        onCancelSuccess={refetch}
        onDelete={actions.handleDelete}
        ppdStamped={invoice.metodo_pago === "PPD" && cfdiStatus === "stamped"}
      />

    </div>
  );
}
