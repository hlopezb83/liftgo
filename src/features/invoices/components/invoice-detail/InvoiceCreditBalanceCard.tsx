import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { InvoiceCreditBalance } from "../../lib/invoiceCreditBalance";

const issueText = {
  missing_fx: "No se puede determinar el excedente: hay pagos sin tipo de cambio válido. No se interpretan como cero ni se convierten 1:1.",
  invalid_source: "No se puede determinar el excedente: revisa los importes, monedas y documentos de origen.",
  inactive_invoice: "Factura en borrador o cancelada: estos importes no se presentan como saldo a favor disponible.",
};
const rateText = (rate: number | string | null) => rate == null ? "sin capturar" : String(rate);

/** Informational only. Receives the same RLS-scoped evidence as invoice detail. */
export function InvoiceCreditBalanceCard({ balance }: { balance: InvoiceCreditBalance }) {
  if (balance.excess === 0 || (!balance.issue && balance.payments.length === 0 && balance.credits.length === 0)) return null;
  return (
    <Card aria-label="Origen del excedente de la factura">
      <CardHeader>
        <CardTitle className="text-base">Excedente de esta factura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {balance.issue ? <p role="status" className="text-sm text-warning">{issueText[balance.issue]}</p> : (
          <>
            <p className="text-xl font-semibold tabular-nums" data-testid="invoice-excess">
              {formatCurrencyWithCode(balance.excess ?? 0, balance.currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              Cobrado: {formatCurrencyWithCode(balance.paid, balance.currency)}.
              Importe neto facturado: {formatCurrencyWithCode(balance.netInvoiced, balance.currency)}
              {" "}(total {formatCurrencyWithCode(balance.invoiceTotal, balance.currency)} menos NC vigentes {formatCurrencyWithCode(balance.credited, balance.currency)}).
            </p>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Importe informativo según los documentos actuales, no un saldo disponible para aplicar.
          Esta consulta no registra nuevos cobros, aplicaciones ni devoluciones.
        </p>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Ver documentos y tipos de cambio de origen</summary>
          <div className="mt-3 space-y-3 text-sm [overflow-wrap:anywhere]">
            <p>Factura {balance.invoiceNumber} · {balance.currency} · TC capturado a MXN: {rateText(balance.exchangeRate)}.</p>
            <ul className="space-y-2" aria-label="Pagos de origen">
              {balance.payments.map((payment) => (
                <li key={payment.id}>
                  Pago {payment.reference} · {formatDateMty(payment.date)} · {formatCurrencyWithCode(payment.amount, payment.currency)}
                  {" "}· TC capturado a MXN: {rateText(payment.exchangeRate)}
                  {" "}· En {balance.currency}: {payment.converted === null ? "no determinable" : formatCurrencyWithCode(payment.converted, balance.currency)}
                  {payment.repUuid ? ` · UUID REP: ${payment.repUuid}` : ""}
                </li>
              ))}
            </ul>
            {balance.credits.length > 0 && (
              <ul className="space-y-1" aria-label="Notas de crédito vigentes de origen">
                {balance.credits.map((note) => <li key={note.id}>{note.number}: {formatCurrencyWithCode(note.amount, note.currency)}</li>)}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Las NC en borrador o canceladas no se incluyen. Una cancelación pendiente sigue vigente hasta su aceptación. La consulta se actualiza cuando cambian los documentos de origen.</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
