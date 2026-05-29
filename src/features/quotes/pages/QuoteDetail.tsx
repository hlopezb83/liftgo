import { useParams } from "react-router-dom";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignForkliftsCard } from "@/features/quotes/components/quotes/AssignForkliftsCard";
import { QuoteDetailActions } from "@/features/quotes/components/quotes/QuoteDetailActions";
import { QuoteConversionDialogs } from "@/features/quotes/components/quotes/QuoteConversionDialogs";
import { QuoteCustomerCard } from "@/features/quotes/components/quotes/QuoteCustomerCard";
import { QuoteDatesCard } from "@/features/quotes/components/quotes/QuoteDatesCard";
import { QuoteHeaderBadges } from "@/features/quotes/components/quotes/QuoteHeaderBadges";
import { useQuoteDetailLogic } from "@/features/quotes/hooks/useQuoteDetailLogic";
import { useQuoteSaleAssignmentStatus } from "@/features/quotes/hooks/quoteDetail/useQuoteSaleAssignmentStatus";

export default function QuoteDetail() {
  const { id } = useParams();
  const logic = useQuoteDetailLogic(id);

  const {
    quote, isLoading, lineItems, customerMatch, quoteType, isSale,
    alreadyConverted, alreadyInvoiced, isConverting,
    setStatus, handleDelete, handleConvertClick,
  } = logic;

  const assignmentStatus = useQuoteSaleAssignmentStatus(quote?.id, lineItems);

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!quote) return <div className="p-6 text-muted-foreground">Cotización no encontrada</div>;

  const currency = (quote as unknown as { currency?: string }).currency;
  const showAssignCard = isSale && quote.status === "accepted";
  const canInvoice = !isSale || assignmentStatus.isComplete;
  const invoiceBlockedReason = assignmentStatus.isComplete
    ? undefined
    : `Asigna los equipos del inventario antes de facturar (${assignmentStatus.totalAssigned}/${assignmentStatus.totalRequired} asignados)`;

  return (
    <div className="p-6 max-w-4xl space-y-6">
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
    </div>
  );
}
