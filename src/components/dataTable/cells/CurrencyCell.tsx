import { formatCurrency } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";

interface CurrencyCellProps {
  value: number | string | null | undefined;
  currency?: string;
  /** Resalta importes negativos en rojo (útil para saldos / variaciones). */
  highlightNegative?: boolean;
  /** Tipografía destacada para totales en cards/summary. */
  emphasized?: boolean;
  className?: string;
}

/**
 * Celda monetaria consistente: alineada a la derecha, tabular-nums y locale MXN por default.
 * Reemplaza las ~20 implementaciones ad-hoc de `formatCurrency` directamente en tablas.
 */
export function CurrencyCell({ value, currency, highlightNegative, emphasized, className }: CurrencyCellProps) {
  const numeric = Number(value ?? 0);
  const negative = highlightNegative && numeric < 0;
  return (
    <span
      className={cn(
        "tabular-nums text-right inline-block",
        emphasized && "text-lg font-semibold",
        negative && "text-destructive",
        className,
      )}
    >
      {formatCurrency(numeric, currency)}
    </span>
  );
}
