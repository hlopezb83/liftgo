import { useParams } from "react-router";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SuccessIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { canActOnPortalQuote, isQuoteAccepted } from "@/lib/rules/quotes";
import { formatDateDisplay, parseDateLocal } from "@/lib/utils";
import { PortalQuoteActionCard } from "../components/PortalQuoteActionCard";
import { TotalsBreakdown } from "../components/TotalsBreakdown";
import {
  usePortalQuote,
  useAcceptPortalQuote,
  useRejectPortalQuote,
} from "../hooks/usePortalExtras";
import { quoteStatusLabel } from "../lib/quoteStatus";


interface LineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  total?: number | null;
}

function computeLineTotal(it: LineItem): number {
  const t = it.total ?? it.amount;
  if (t != null) return Number(t);
  return Number(it.unit_price ?? 0) * Number(it.quantity ?? 1);
}

export default function PortalQuoteDetail() {
  const { id } = useParams();
  const { data: quote, isLoading } = usePortalQuote(id);
  const accept = useAcceptPortalQuote();
  const reject = useRejectPortalQuote();

  if (isLoading) return <Skeleton className="h-96" />;
  if (!quote) return <p className="text-muted-foreground">Cotización no encontrada</p>;

  const items: LineItem[] = Array.isArray(quote.line_items) ? (quote.line_items as LineItem[]) : [];
  // Bloque 3.3 (R4): si valid_until pasó, no permitimos aceptar aunque el
  // status siga en 'sent'. El server-side (RPC accept_portal_quote) también
  // valida vigencia; esto es la guarda visual para no engañar al cliente.
  const validUntilDate = quote.valid_until ? parseDateLocal(quote.valid_until) : null;
  const isExpired = validUntilDate ? validUntilDate.getTime() < new Date().setHours(0, 0, 0, 0) : false;
  const canAct = canActOnPortalQuote(quote) && !isExpired;
  const wasAccepted = isQuoteAccepted(quote);

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={quote.quote_number}
        backHref="/portal/quotes"
        backLabel="Cotizaciones"
      />
      <div className="text-sm text-muted-foreground -mt-2">
        <span className="inline-flex items-center gap-2">
          <StatusBadge status={quote.status} label={quoteStatusLabel(quote.status)} />
          <span>Emitida {formatDateDisplay(quote.created_at)}</span>
          {quote.valid_until && <span>· Válida hasta {formatDateDisplay(quote.valid_until)}</span>}
        </span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Partidas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">Descripción</th>
                <th className="text-right px-3 py-2">Cant.</th>
                <th className="text-right px-3 py-2">P. Unit.</th>
                <th className="text-right px-3 py-2">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className={idx % 2 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2">{it.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.quantity ?? 1}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(it.unit_price ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(computeLineTotal(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="border-t p-4">
            <TotalsBreakdown
              subtotal={quote.subtotal}
              taxRate={quote.tax_rate}
              taxAmount={quote.tax_amount}
              total={quote.total}
              emphasizeTotal
            />
          </div>

        </CardContent>
      </Card>

      {wasAccepted && (
        <Card className="border-status-available/40 bg-status-available/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <SuccessIcon className="h-5 w-5 text-status-available mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Cotización aceptada</p>
              <p className="text-muted-foreground">
                {quote.accepted_at ? `El ${formatDateDisplay(quote.accepted_at)}.` : ""} Nuestro equipo te contactará para programar la entrega.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isExpired && !wasAccepted && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="pt-4 text-sm">
            <p className="font-semibold">Cotización vencida</p>
            <p className="text-muted-foreground">
              Esta cotización perdió vigencia el {formatDateDisplay(quote.valid_until)}. Solicita una actualización a tu ejecutivo para poder aceptarla.
            </p>
          </CardContent>
        </Card>
      )}

      {canAct && (
        <PortalQuoteActionCard
          quoteId={quote.id}
          onAccept={(qid) => accept.mutate(qid)}
          onReject={(payload) => reject.mutate(payload)}
          acceptPending={accept.isPending}
          rejectPending={reject.isPending}
        />
      )}
    </PageContainer>
  );
}

