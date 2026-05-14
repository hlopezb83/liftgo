import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";

interface CustomerFinancialSummaryProps {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
}

export function CustomerFinancialSummary({ totalInvoiced, totalPaid, outstanding }: CustomerFinancialSummaryProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Resumen Financiero</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Facturado</span>
          <span className="font-mono font-semibold">{formatCurrency(totalInvoiced)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Pagado</span>
          <span className="font-mono font-semibold text-status-available">{formatCurrency(totalPaid)}</span>
        </div>
        <div className="flex justify-between text-sm border-t pt-2">
          <span className="font-medium">Saldo Pendiente</span>
          <span className={`font-mono font-bold ${outstanding > 0 ? "text-destructive" : ""}`}>{formatCurrency(outstanding)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
