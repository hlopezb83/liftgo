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
  const fmt = currency !== undefined ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  // Bloque 3 (R5): normaliza taxRate a porcentaje entero para display.
  // Acepta fracción (0.16) o porcentaje (16) sin duplicar la magnitud.
  const displayRate = taxRate > 0 && taxRate < 1 ? Math.round(taxRate * 100) : Math.round(taxRate);
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-sm sm:ml-auto sm:w-fit">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums min-w-28 text-right whitespace-nowrap">{fmt(subtotal)}</span>
          {onTaxRateChange ? (
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <span className="text-muted-foreground">IVA</span>
              <Select value={String(taxRate)} onValueChange={(v) => onTaxRateChange(Number(v))}>
                <SelectTrigger className="w-36 max-w-full h-8">
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
            </div>
          ) : (
            <span className="text-muted-foreground">IVA ({displayRate}%)</span>
          )}
          <span className="tabular-nums min-w-28 text-right whitespace-nowrap">{fmt(taxAmount)}</span>
          <div className="col-span-2 flex items-center justify-between gap-4 text-base font-bold border-t pt-2">
            <span>Total</span>
            <span className="tabular-nums min-w-28 text-right whitespace-nowrap">{fmt(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
