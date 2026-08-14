import { WarnIcon } from "@/components/icons";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface Props {
  total: number;
  currency: string;
  totalMxn: number;
  threshold: number;
}

/**
 * Panel pegajoso con el total de la factura. Avisa por adelantado si el
 * importe supera el umbral de aprobación de CxP, para que el usuario no se
 * lleve la sorpresa hasta después de guardar.
 */
export function SupplierBillTotalPanel({ total, currency, totalMxn, threshold }: Props) {
  const needsApproval = threshold > 0 && totalMxn > threshold;
  return (
    <div className="sticky bottom-0 space-y-2 rounded-md border bg-muted/70 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total a pagar</span>
        <span className="tabular-nums text-lg font-bold">{formatCurrencyWithCode(total, currency)}</span>
      </div>
      {needsApproval && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Supera el umbral de {formatCurrencyWithCode(threshold, "MXN")}: la factura quedará
          pendiente de aprobación antes de poder pagarse.
        </p>
      )}
    </div>
  );
}
