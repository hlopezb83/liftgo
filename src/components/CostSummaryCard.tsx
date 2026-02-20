import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import type { LineItem } from "@/lib/invoiceUtils";

interface CostSummaryCardProps {
  lineItems: LineItem[];
  subtotal: number;
  taxRate: string | number;
  taxAmount: number;
  total: number;
}

export function CostSummaryCard({ lineItems, subtotal, taxRate, taxAmount, total }: CostSummaryCardProps) {
  if (lineItems.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vista Previa de Costos</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{item.description} × {item.quantity}</span>
            <span className="font-mono">{formatCurrency(item.total)}</span>
          </div>
        ))}
        <div className="border-t pt-2 mt-2 space-y-1">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span>IVA ({taxRate}%)</span><span className="font-mono">{formatCurrency(taxAmount)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono">{formatCurrency(total)}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}
