import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applyDiscount } from "@/lib/domain/invoiceHelpers";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface CostSummaryCardProps {
  lineItems: LineItem[];
  subtotal: number;
  taxRate: string | number;
  taxAmount: number;
  total: number;
  currency?: string;
}

function discountLabel(item: LineItem, currency?: string): string {
  if (!item.discount || item.discount <= 0) return "";
  const fmt = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  return item.discount_type === "$" ? ` (-${fmt(item.discount)})` : ` (-${item.discount}%)`;
}

export function CostSummaryCard({ lineItems, subtotal, taxRate, taxAmount, total, currency }: CostSummaryCardProps) {
  const fmt = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  if (lineItems.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Vista Previa de Costos</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>
              {item.description} × {item.quantity}
              {(item.discount ?? 0) > 0 && (
                <span className="text-destructive text-xs ml-1">{discountLabel(item, currency)}</span>
              )}
            </span>
            <span className="font-mono">{fmt(applyDiscount(item))}</span>
          </div>
        ))}
        <div className="border-t pt-2 mt-2 space-y-1">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
          <div className="flex justify-between text-sm"><span>IVA ({taxRate}%)</span><span className="font-mono">{fmt(taxAmount)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}
