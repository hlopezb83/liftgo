import { useParams } from "react-router-dom";
import { useInvoice } from "../hooks/invoices/useInvoices";
import { useInvoiceBookings } from "../hooks/invoices/useInvoiceBookings";
import type { BookingWithForklift } from "@/features/bookings";
import { usePayments } from "../hooks/usePayments";
import { useQuote } from "@/features/quotes";
import { useUserRole } from "@/features/users";
import { useCompanySettings } from "@/features/company-settings";
import { useInvoiceDetailActions } from "../hooks/invoiceDetail/useInvoiceDetailActions";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/domain/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { InvoiceFiscalDataCard } from "../components/invoice-detail/InvoiceFiscalDataCard";
import { InvoicePaymentSummary } from "../components/invoice-detail/InvoicePaymentSummary";
import { PaymentIntentsSection } from "../components/invoice-detail/PaymentIntentsSection";
import { InvoiceHistoryCard } from "../components/invoice-detail/InvoiceHistoryCard";
import { InvoiceDetailActions } from "../components/invoice-detail/InvoiceDetailActions";
import { InvoiceSourceLinks } from "../components/invoice-detail/InvoiceSourceLinks";
import { InvoiceSummaryCards } from "../components/invoice-detail/InvoiceSummaryCards";
import { InvoiceDetailDialogs } from "../components/invoice-detail/InvoiceDetailDialogs";
import { StampErrorDialog } from "../components/StampErrorDialog";
import { InvoiceCreditNotesCard } from "../components/invoice-detail/InvoiceCreditNotesCard";
import { useCreditNotesForInvoice } from "../hooks/creditNotes/useCreditNotes";
import { InvoiceDetailBadges } from "../components/invoice-detail/InvoiceDetailBadges";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLineItems } from "@/lib/domain/lineItems";
import type { LineItem } from "@/lib/domain/invoiceHelpers";

import { computeInvoiceVisibility } from "../lib/invoiceVisibility";

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
  const visibility = computeInvoiceVisibility(
    invoice as Parameters<typeof computeInvoiceVisibility>[0],
    company as Parameters<typeof computeInvoiceVisibility>[1],
  );
  return {
    paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total,
    balance: total - totalPaid - creditedAmount,
    showCfdiError: Boolean(invoice.cfdi_error_message) && cfdiStatus !== "stamped",
    showCollectionNotes: !["paid", "draft"].includes(invoice.status),
    visibility,
    ppdStamped: visibility.showRepColumn,
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
  const { data: invoiceBookingsRows } = useInvoiceBookings(id);
  const sourceBookings: BookingWithForklift[] = (invoiceBookingsRows ?? [])
    .map((r) => (r as unknown as { bookings: BookingWithForklift | null }).bookings)
    .filter((b): b is BookingWithForklift => !!b);


  const actions = useInvoiceDetailActions(invoice ?? undefined, refetch);

  if (isLoading) return <PageContainer className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></PageContainer>;
  if (!invoice || !id) return <PageContainer><p className="text-muted-foreground">Factura no encontrada</p></PageContainer>;

  const d = deriveInvoiceData(invoice, payments, creditNotes, company);
  const { paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total, balance, showCfdiError, showCollectionNotes, visibility, ppdStamped } = d;
  const notes = invoice.notes;

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={invoice.invoice_number}
        backTo="/invoices"
        badges={
          <InvoiceDetailBadges
            invoiceStatus={invoice.status}
            cfdiStatus={cfdiStatus}
            cancellationStatus={(invoice as unknown as { cancellation_status?: string | null }).cancellation_status ?? null}
            showSandboxChip={visibility.showSandboxChip}
          />
        }
        actions={
          <InvoiceDetailActions
            invoice={invoice}
            cfdiStatus={cfdiStatus}
            userRole={userRole ?? undefined}
            visibility={visibility}
            isStamping={actions.stampCfdi.isPending}
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

      <InvoiceSourceLinks sourceQuote={sourceQuote} sourceBookings={sourceBookings} />
      <InvoiceFiscalDataCard invoice={invoice} />
      <ReadOnlyLineItemsTable lineItems={lineItems} />
      <TotalsSummary subtotal={Number(invoice.subtotal)} taxRate={Number(invoice.tax_rate)} taxAmount={Number(invoice.tax_amount)} total={total} />

      <InvoicePaymentSummary
        totalPaid={totalPaid}
        balance={balance}
        payments={paymentList}
        ppdStamped={ppdStamped}
        allowRepMutations={visibility.allowRepMutations}
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
      <StampErrorDialog
        open={!!actions.stampError}
        onOpenChange={(o) => { if (!o) actions.clearStampError(); }}
        message={actions.stampError?.message ?? ""}
        kind={actions.stampError?.kind ?? "unknown"}
        customerId={actions.stampError?.customerId ?? null}
      />

    </PageContainer>
  );
}
