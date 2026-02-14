import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";

interface TotalsSummaryProps {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export function TotalsSummary({ subtotal, taxRate, taxAmount, total }: TotalsSummaryProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono w-28 text-right">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">VAT ({taxRate}%)</span>
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
