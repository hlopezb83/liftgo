import { useParams } from "react-router-dom";
import { useInvoice } from "../hooks/invoices/useInvoices";
import { useBooking } from "@/features/bookings";
import { usePayments } from "../hooks/usePayments";
import { useQuote } from "@/features/quotes";
import { useUserRole } from "@/features/users";
import { useCompanySettings } from "@/features/company-settings";
import { useInvoiceDetailActions } from "../hooks/invoiceDetail/useInvoiceDetailActions";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/domain/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { InvoiceFiscalDataCard } from "../components/invoice-detail/InvoiceFiscalDataCard";
import { InvoicePaymentSummary } from "../components/invoice-detail/InvoicePaymentSummary";
import { PaymentIntentsSection } from "../components/invoice-detail/PaymentIntentsSection";
import { InvoiceHistoryCard } from "../components/invoice-detail/InvoiceHistoryCard";
import { InvoiceDetailActions } from "../components/invoice-detail/InvoiceDetailActions";
import { InvoiceSourceLinks } from "../components/invoice-detail/InvoiceSourceLinks";
import { InvoiceSummaryCards } from "../components/invoice-detail/InvoiceSummaryCards";
import { InvoiceDetailDialogs } from "../components/invoice-detail/InvoiceDetailDialogs";
import { InvoiceCreditNotesCard } from "../components/invoice-detail/InvoiceCreditNotesCard";
import { useCreditNotesForInvoice } from "../hooks/creditNotes/useCreditNotes";
import { InvoiceDetailBadges } from "../components/invoice-detail/InvoiceDetailBadges";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { LineItem } from "@/lib/domain/invoiceHelpers";

function computeCreditedAmount(creditNotes: Array<{ cfdi_status: string | null; status: string; cancellation_status: string | null; total: number }>): number {
  return creditNotes
    .filter((cn) => cn.cfdi_status === "stamped" && cn.status !== "cancelled" && cn.cancellation_status !== "accepted")
    .reduce((s, cn) => s + Number(cn.total), 0);
}

function deriveInvoiceData(
  invoice: NonNullable<ReturnType<typeof useInvoice>["data"]>,
  payments: ReturnType<typeof usePayments>["data"],
  creditNotes: ReturnType<typeof useCreditNotesForInvoice>["data"],
  company: ReturnType<typeof useCompanySettings>["data"],
) {
  const paymentList = payments ?? [];
  const lineItems = parseLineItems<LineItem>(invoice.line_items);
  const cfdiStatus = invoice.cfdi_status ?? "pending";
  const totalPaid = paymentList.reduce((sum, p) => sum + Number(p.amount), 0);
  const creditedAmount = computeCreditedAmount(creditNotes ?? []);
  const total = Number(invoice.total);
  const pacMode = (company as { facturapi_mode?: string } | null | undefined)?.facturapi_mode ?? "test";
  return {
    paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total,
    balance: total - totalPaid - creditedAmount,
    showCfdiError: Boolean(invoice.cfdi_error_message) && cfdiStatus !== "stamped",
    showCollectionNotes: !["paid", "draft"].includes(invoice.status),
    isLive: pacMode === "live",
    showPacBadge: cfdiStatus !== "stamped",
    ppdStamped: invoice.metodo_pago === "PPD" && cfdiStatus === "stamped",
  };
}

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

  const d = deriveInvoiceData(invoice, payments, creditNotes, company);
  const { paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total, balance, showCfdiError, showCollectionNotes, isLive, showPacBadge, ppdStamped } = d;
  const notes = invoice.notes;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={invoice.invoice_number}
        backTo="/invoices"
        badges={
          <InvoiceDetailBadges
            invoiceStatus={invoice.status}
            cfdiStatus={cfdiStatus}
            showPacBadge={showPacBadge}
            isLive={isLive}
          />
        }
        actions={
          <InvoiceDetailActions
            invoice={invoice}
            cfdiStatus={cfdiStatus}
            userRole={userRole ?? undefined}
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
        dueDate={invoice.due_date ?? ""}
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
        ppdStamped={ppdStamped}
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
        ppdStamped={ppdStamped}
      />

    </div>
  );
}
