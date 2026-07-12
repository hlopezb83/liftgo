import { useParams } from "react-router";
import { NotesCard } from "@/components/domain/NotesCard";
import { ReadOnlyLineItemsTable } from "@/components/domain/ReadOnlyLineItemsTable";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignForkliftsCard } from "../components/quotes/AssignForkliftsCard";
import { QuoteConversionDialogs } from "../components/quotes/QuoteConversionDialogs";
import { QuoteCustomerCard } from "../components/quotes/QuoteCustomerCard";
import { QuoteDatesCard } from "../components/quotes/QuoteDatesCard";
import { QuoteDetailActions } from "../components/quotes/QuoteDetailActions";
import { QuoteHeaderBadges } from "../components/quotes/QuoteHeaderBadges";
import { useQuoteSaleAssignmentStatus } from "../hooks/quoteDetail/useQuoteSaleAssignmentStatus";
import { useQuoteDetailLogic } from "../hooks/useQuoteDetailLogic";

export default function QuoteDetail() {
  const { id } = useParams();
  const logic = useQuoteDetailLogic(id);

  const {
    quote, isLoading, lineItems, customerMatch, quoteType, isSale,
    alreadyConverted, alreadyInvoiced, isConverting,
    setStatus, handleDelete, handleConvertClick,
  } = logic;

  const assignmentStatus = useQuoteSaleAssignmentStatus(quote?.id, lineItems);

  if (isLoading) return <PageContainer><Skeleton className="h-64" /></PageContainer>;
  if (!quote) return <PageContainer><p className="text-muted-foreground">Cotización no encontrada</p></PageContainer>;

  const currency = (quote as unknown as { currency?: string }).currency;
  const showAssignCard = isSale && quote.status === "accepted";
  const canInvoice = !isSale || assignmentStatus.isComplete;
  const invoiceBlockedReason = assignmentStatus.isComplete
    ? undefined
    : `Asigna los equipos del inventario antes de facturar (${assignmentStatus.totalAssigned}/${assignmentStatus.totalRequired} asignados)`;

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={quote.quote_number}
        backTo="/quotes"
        badges={
          <QuoteHeaderBadges
            status={quote.status}
            quoteType={quoteType}
            isSale={isSale}
            currency={currency}
          />
        }
        actions={
          <QuoteDetailActions
            quote={quote}
            isSale={isSale}
            alreadyConverted={alreadyConverted}
            alreadyInvoiced={alreadyInvoiced}
            isConverting={isConverting}
            canInvoice={canInvoice}
            invoiceBlockedReason={invoiceBlockedReason}
            onSetStatus={setStatus}
            onConvertClick={handleConvertClick}
            onDelete={handleDelete}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <QuoteCustomerCard
          customerName={quote.customer_name}
          rfc={customerMatch?.rfc}
          cp={customerMatch?.domicilio_fiscal_cp}
        />
        <QuoteDatesCard
          isSale={isSale}
          startDate={quote.start_date}
          endDate={quote.end_date}
          validUntil={quote.valid_until}
        />
      </div>

      <ReadOnlyLineItemsTable lineItems={lineItems} />

      <TotalsSummary
        subtotal={quote.subtotal}
        taxRate={quote.tax_rate}
        taxAmount={quote.tax_amount}
        total={quote.total}
        currency={currency}
      />

      {quote.notes && <NotesCard value={quote.notes} readOnly />}

      {showAssignCard && (
        <AssignForkliftsCard quoteId={quote.id} lineItems={lineItems} />
      )}

      <QuoteConversionDialogs logic={logic} />
    </PageContainer>
  );
}
