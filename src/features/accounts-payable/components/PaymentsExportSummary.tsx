import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { CurrencyTotal } from "../hooks/usePaymentSelection";

interface Props {
  notes: string;
  onNotesChange: (value: string) => void;
  selectedCount: number;
  /** Totales agrupados por moneda (los pagos pueden mezclar MXN y USD). */
  totalsByCurrency: CurrencyTotal[];
  hasInvalid: boolean;
}

export function PaymentsExportSummary({
  notes, onNotesChange, selectedCount, totalsByCurrency, hasInvalid,
}: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 pt-2">
      <div className="space-y-1.5">
        <Label>Notas del lote (opcional)</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Ej. Pagos semana 24"
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-3 flex flex-col justify-center">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Pagos seleccionados</span>
          <span className="font-semibold">{selectedCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-muted-foreground">Total a pagar</span>
          <span className="font-mono font-bold text-lg text-right">
            {totalsByCurrency.length === 0
              ? formatCurrencyWithCode(0)
              : totalsByCurrency.map((t) => (
                  <span key={t.currency} className="block">
                    {formatCurrencyWithCode(t.total, t.currency)} {t.currency}
                  </span>
                ))}
          </span>
        </div>
        {hasInvalid && (
          <p className="text-xs text-destructive mt-1">
            Hay renglones inválidos: proveedor sin CLABE válida o monto mayor al saldo pendiente.
          </p>
        )}
      </div>
    </div>
  );
}
