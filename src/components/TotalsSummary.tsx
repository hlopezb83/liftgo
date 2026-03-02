import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatCurrency";
import { APP_CONFIG } from "@/lib/config";

interface TotalsSummaryProps {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  onTaxRateChange?: (rate: number) => void;
}

export function TotalsSummary({ subtotal, taxRate, taxAmount, total, onTaxRateChange }: TotalsSummaryProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono w-28 text-right">{formatCurrency(subtotal)}</span>
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
              <span className="text-muted-foreground">IVA ({taxRate}%)</span>
            )}
            <span className="font-mono w-28 text-right">{formatCurrency(taxAmount)}</span>
          </div>
          <div className="flex items-center gap-4 text-base font-bold border-t pt-2">
            <span>Total</span>
            <span className="font-mono w-28 text-right">{formatCurrency(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
