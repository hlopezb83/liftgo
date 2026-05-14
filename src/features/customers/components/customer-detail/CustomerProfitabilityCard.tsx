import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";

interface Props {
  revenue: number;
  maintenance_cost: number;
  gross_margin: number;
  margin_percent: number;
}

export function CustomerProfitabilityCard({ revenue, maintenance_cost, gross_margin, margin_percent }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Rentabilidad</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Ingresos</span>
          <span className="font-mono font-semibold">{formatCurrency(revenue)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Costos Mant.</span>
          <span className="font-mono font-semibold">{formatCurrency(maintenance_cost)}</span>
        </div>
        <div className="flex justify-between text-sm border-t pt-2">
          <span className="font-medium">Margen Bruto</span>
          <span className={`font-mono font-bold ${gross_margin >= 0 ? "text-status-available" : "text-destructive"}`}>
            {formatCurrency(gross_margin)} ({margin_percent}%)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
