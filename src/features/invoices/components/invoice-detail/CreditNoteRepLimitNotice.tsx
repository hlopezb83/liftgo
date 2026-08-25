import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import type { Payment } from "../../hooks/usePayments";

interface Props {
  invoiceTotal: number;
  priorCredits: number;
  repBacked: number;
  maxCreditable: number;
  repPayments: Payment[];
  blocked: boolean;
}

/**
 * H-5: explica por qué el máximo acreditable está topado y qué complementos de
 * pago hay que cancelar ante el SAT antes de poder acreditar más.
 */
export function CreditNoteRepLimitNotice({
  invoiceTotal, priorCredits, repBacked, maxCreditable, repPayments, blocked,
}: Props) {
  return (
    <div className="mx-6 mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
      <p className="font-medium">
        {blocked
          ? "No se puede emitir una nota de crédito por ahora"
          : "Máximo acreditable limitado por complementos de pago"}
      </p>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Total de la factura</span>
          <span className="font-mono tabular-nums">{formatCurrency(invoiceTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Notas de crédito previas</span>
          <span className="font-mono tabular-nums">− {formatCurrency(priorCredits)}</span>
        </div>
        <div className="flex justify-between">
          <span>Declarado en complementos de pago (REP) vigentes</span>
          <span className="font-mono tabular-nums">− {formatCurrency(repBacked)}</span>
        </div>
        <div className="flex justify-between border-t pt-0.5 font-medium text-foreground">
          <span>Máximo acreditable</span>
          <span className="font-mono tabular-nums">{formatCurrency(maxCreditable)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Para acreditar más, primero cancela ante el SAT los complementos de pago listados abajo, desde el
        historial de pagos de esta factura. La aceptación del SAT puede tardar hasta 72 horas.
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {repPayments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className="font-mono">{p.rep_number ?? p.rep_folio ?? "REP"}</span>
            <span className="text-muted-foreground">{formatDateDisplay(p.payment_date)}</span>
            <span className="font-mono tabular-nums">{formatCurrency(Number(p.amount) || 0)}</span>
            <Badge variant="outline" className="border-warning/30 text-warning">Timbrado</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
