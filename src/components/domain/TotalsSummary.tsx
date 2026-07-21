import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_CONFIG } from "@/lib/config";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface TotalsSummaryProps {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  onTaxRateChange?: (rate: number) => void;
  currency?: string;
}

export function TotalsSummary({ subtotal, taxRate, taxAmount, total, onTaxRateChange, currency }: TotalsSummaryProps) {
  const fmt = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  // Bloque 3 (R5): normaliza taxRate a porcentaje entero para display.
  // Acepta fracción (0.16) o porcentaje (16) sin duplicar la magnitud.
  const displayRate = taxRate > 0 && taxRate < 1 ? Math.round(taxRate * 100) : Math.round(taxRate);
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono w-28 text-right">{fmt(subtotal)}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {onTaxRateChange ? (
              <>
                <span className="text-muted-foreground">IVA</span>
                <Select value={String(taxRate)} onValueChange={(v) => onTaxRateChange(Number(v))}>
                  <SelectTrigger className="w-36 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_CONFIG.TAX_RATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <span className="text-muted-foreground">IVA ({displayRate}%)</span>
            )}
            <span className="font-mono w-28 text-right">{fmt(taxAmount)}</span>
          </div>
          <div className="flex items-center gap-4 text-base font-bold border-t pt-2">
            <span>Total</span>
            <span className="font-mono w-28 text-right">{fmt(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
