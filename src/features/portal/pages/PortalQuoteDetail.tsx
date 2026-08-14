import { useParams } from "react-router";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SuccessIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { canActOnPortalQuote, isQuoteAccepted } from "@/lib/rules/quotes";
import { formatDateDisplay, nowMty, parseDateLocal } from "@/lib/utils";
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
  const { data: quote, isLoading, isError, refetch } = usePortalQuote(id);
  const accept = useAcceptPortalQuote();
  const reject = useRejectPortalQuote();

  if (isLoading) return <Skeleton className="h-96" />;
  // A4-01: un error de red NO es "cotización no encontrada" — el cliente
  // externo podría estar intentando aceptar una cotización vigente.
  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <QueryErrorState entity="la cotización" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }
  if (!quote) return <p className="text-muted-foreground">Cotización no encontrada</p>;

  const items: LineItem[] = Array.isArray(quote.line_items) ? (quote.line_items as LineItem[]) : [];
  // Bloque 3.3 (R4): si valid_until pasó, no permitimos aceptar aunque el
  // status siga en 'sent'. El server-side (RPC accept_portal_quote) también
  // valida vigencia; esto es la guarda visual para no engañar al cliente.
  const validUntilDate = quote.valid_until ? parseDateLocal(quote.valid_until) : null;
  // Vigencia contra la fecha de Monterrey (TZ del negocio), NO la medianoche
  // local del navegador del cliente — mismo patrón que PortalUpcomingDues.
  const todayMty = nowMty();
  const startOfTodayMty = new Date(
    todayMty.getFullYear(),
    todayMty.getMonth(),
    todayMty.getDate(),
  ).getTime();
  const isExpired = validUntilDate ? validUntilDate.getTime() < startOfTodayMty : false;
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">P. Unit.</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell
                    className="max-w-[10rem] truncate"
                    title={it.description ?? undefined}
                  >
                    {it.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{it.quantity ?? 1}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(it.unit_price ?? 0))}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(computeLineTotal(it))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

