import { formatCurrency } from "@/lib/format/formatCurrency";

interface Props {
  subtotal: number | string | null | undefined;
  taxRate?: number | string | null;
  taxAmount: number | string | null | undefined;
  total: number | string | null | undefined;
  /** Cuando `true`, resalta el total con tamaño mayor (portal invoice). */
  emphasizeTotal?: boolean;
  className?: string;
}

/**
 * Bloque estándar Subtotal / IVA / Total usado en documentos del portal
 * (facturas y cotizaciones). Antes vivía duplicado en cada página.
 */
export function TotalsBreakdown({
  subtotal,
  taxRate,
  taxAmount,
  total,
  emphasizeTotal = false,
  className = "",
}: Props) {
  const totalClass = emphasizeTotal ? "text-base" : "";
  return (
    <div className={`space-y-1 text-sm text-right ${className}`}>
      <div className="flex justify-end gap-8">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono">{formatCurrency(Number(subtotal ?? 0))}</span>
      </div>
      <div className="flex justify-end gap-8">
        <span className="text-muted-foreground">IVA ({taxRate ?? 0}%)</span>
        <span className="font-mono">{formatCurrency(Number(taxAmount ?? 0))}</span>
      </div>
      <div className={`flex justify-end gap-8 font-bold ${totalClass}`}>
        <span>Total</span>
        <span className="font-mono">{formatCurrency(Number(total ?? 0))}</span>
      </div>
    </div>
  );
}
