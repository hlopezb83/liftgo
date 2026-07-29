import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface InvoiceSummaryCardsProps {
  total: number;
  totalPaid: number;
  balance: number;
  currency: string;
}

export function InvoiceSummaryCards({ total, totalPaid, balance, currency }: InvoiceSummaryCardsProps) {
  const balanceCls = balance > 0 ? "text-destructive" : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatCurrencyWithCode(total, currency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Pagado</p>
          <p className="text-xl font-bold font-mono text-status-available">{formatCurrencyWithCode(totalPaid, currency)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className={`text-xl font-bold font-mono ${balanceCls}`}>{formatCurrencyWithCode(balance, currency)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
