import type { BookingWithForklift } from "@/features/bookings";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/domain/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { InvoiceFiscalDataCard } from "./InvoiceFiscalDataCard";
import { ValidateReceptorButton } from "./ValidateReceptorButton";
import { InvoicePaymentSummary } from "./InvoicePaymentSummary";
import { PaymentIntentsSection } from "./PaymentIntentsSection";
import { InvoiceHistoryCard } from "./InvoiceHistoryCard";
import { InvoiceDetailActions } from "./InvoiceDetailActions";
import { InvoiceSourceLinks } from "./InvoiceSourceLinks";
import { InvoiceSummaryCards } from "./InvoiceSummaryCards";
import { InvoiceDetailIdentifiers } from "./InvoiceDetailIdentifiers";
import { InvoiceDetailDialogs } from "./InvoiceDetailDialogs";
import { StampErrorDialog } from "../StampErrorDialog";
import { InvoiceCreditNotesCard } from "./InvoiceCreditNotesCard";
import { InvoiceDetailBadges } from "./InvoiceDetailBadges";
import type { useInvoice } from "../../hooks/invoices/useInvoices";
import type { usePayments } from "../../hooks/usePayments";
import type { useQuote } from "@/features/quotes";
import type { useInvoiceDetailActions } from "../../hooks/invoiceDetail/useInvoiceDetailActions";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import type { computeInvoiceVisibility } from "../../lib/invoiceVisibility";

type Invoice = NonNullable<ReturnType<typeof useInvoice>["data"]>;
type Payment = NonNullable<ReturnType<typeof usePayments>["data"]>[number];
type Quote = ReturnType<typeof useQuote>["data"];
type ActionsBundle = ReturnType<typeof useInvoiceDetailActions>;
type Visibility = ReturnType<typeof computeInvoiceVisibility>;

interface Derived {
  paymentList: Payment[];
  lineItems: LineItem[];
  cfdiStatus: string;
  totalPaid: number;
  creditedAmount: number;
  total: number;
  balance: number;
  showCfdiError: boolean;
  showCollectionNotes: boolean;
  visibility: Visibility;
  ppdStamped: boolean;
}

interface Props {
  invoice: Invoice;
  id: string;
  derived: Derived;
  actions: ActionsBundle;
  userRole?: string;
  sourceQuote: Quote;
  sourceBookings: BookingWithForklift[];
  refetch: () => void;
}

export function InvoiceDetailBody({
  invoice, id, derived, actions, userRole, sourceQuote, sourceBookings, refetch,
}: Props) {
  const { paymentList, lineItems, cfdiStatus, totalPaid, creditedAmount, total, balance,
    showCfdiError, showCollectionNotes, visibility, ppdStamped } = derived;

  return (
    <>
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

      <InvoiceDetailIdentifiers
        cfdiUuid={invoice.cfdi_uuid}
        serie={invoice.serie}
        folio={invoice.folio}
        isStamped={Boolean(invoice.cfdi_uuid) || invoice.cfdi_status === "stamped"}
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
      <InvoiceFiscalDataCard invoice={invoice} extraActions={<ValidateReceptorButton invoice={invoice} />} />
      <ReadOnlyLineItemsTable lineItems={lineItems} />
      <TotalsSummary
        subtotal={Number(invoice.subtotal)}
        taxRate={Number(invoice.tax_rate)}
        taxAmount={Number(invoice.tax_amount)}
        total={total}
      />

      <InvoicePaymentSummary
        totalPaid={totalPaid}
        balance={balance}
        payments={paymentList}
        ppdStamped={ppdStamped}
        allowRepMutations={visibility.allowRepMutations}
        creditedAmount={creditedAmount}
      />
      <PaymentIntentsSection invoiceId={id} />
      <InvoiceCreditNotesCard invoice={invoice} totalPaid={totalPaid} />
      <InvoiceHistoryCard invoiceId={id} />

      <InvoiceDetailDialogs
        invoiceId={id}
        invoiceNumber={invoice.invoice_number}
        invoiceTotal={total}
        balance={balance}
        notes={invoice.notes}
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
        receptor={actions.stampError?.receptor}
      />
    </>
  );
}
