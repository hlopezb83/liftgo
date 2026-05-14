import { useParams } from "react-router-dom";
import { TotalsSummary } from "@/components/TotalsSummary";
import { ReadOnlyLineItemsTable } from "@/components/ReadOnlyLineItemsTable";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesCard } from "@/components/NotesCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS } from "@/lib/constants";
import { AssignForkliftsCard } from "@/features/quotes/components/quotes/AssignForkliftsCard";
import { QuoteDetailActions } from "@/features/quotes/components/quotes/QuoteDetailActions";
import { QuoteConversionDialogs } from "@/features/quotes/components/quotes/QuoteConversionDialogs";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { useQuoteDetailLogic } from "@/features/quotes/hooks/useQuoteDetailLogic";

export default function QuoteDetail() {
  const { id } = useParams();
  const logic = useQuoteDetailLogic(id);

  const {
    quote, isLoading, lineItems, customerMatch, quoteType, isSale,
    alreadyConverted, isConverting,
    setStatus, handleDelete, handleConvertClick,
  } = logic;

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!quote) return <div className="p-6 text-muted-foreground">Cotización no encontrada</div>;

  const currency = (quote as unknown as { currency?: string }).currency;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <DetailPageHeader
        title={quote.quote_number}
        backTo="/quotes"
        badges={
          <div className="flex gap-2 items-center">
            <StatusBadge status={quote.status} />
            <Badge variant={isSale ? "default" : "secondary"}>{STATUS_LABELS[quoteType] || quoteType}</Badge>
            {currency && currency !== "MXN" && <Badge variant="outline">{currency}</Badge>}
          </div>
        }
        actions={
          <QuoteDetailActions
            quote={quote}
            isSale={isSale}
            alreadyConverted={alreadyConverted}
            isConverting={isConverting}
            onSetStatus={setStatus}
            onConvertClick={handleConvertClick}
            onDelete={handleDelete}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium">{quote.customer_name || "—"}</p>
            {customerMatch?.rfc && <p className="text-sm text-muted-foreground">RFC: {customerMatch.rfc}</p>}
            {customerMatch?.domicilio_fiscal_cp && <p className="text-sm text-muted-foreground">C.P. {customerMatch.domicilio_fiscal_cp}</p>}
          </CardContent>
        </Card>
        {!isSale ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Fechas</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Periodo:</span> {formatDateRange(quote.start_date, quote.end_date)}</p>
              <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(quote.valid_until)}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Vigencia</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(quote.valid_until)}</p>
            </CardContent>
          </Card>
        )}
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

      {isSale && quote.status === "accepted" && (
        <AssignForkliftsCard quoteId={quote.id} lineItems={lineItems} />
      )}

      <QuoteConversionDialogs logic={logic} />
    </div>
  );
}
