import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ForkliftFinancials } from "../../hooks/forklifts/useForkliftFinancials";
import { Skeleton } from "@/components/ui/skeleton";

interface ForkliftFinancialCardProps {
  financials: ForkliftFinancials | undefined;
  isLoading: boolean;
}

export function ForkliftFinancialCard({ financials, isLoading }: ForkliftFinancialCardProps) {
  if (isLoading) return <Skeleton className="h-48" />;
  if (!financials) return null;

  const metrics = [
    { label: "Ingresos Totales", value: formatCurrency(financials.revenue), color: "text-success" },
    { label: "Costos de Mantenimiento", value: formatCurrency(financials.maintenance_cost), color: "text-warning" },
    { label: "Margen Bruto", value: formatCurrency(financials.gross_margin), color: financials.gross_margin >= 0 ? "text-success" : "text-destructive" },
    { label: "ROI", value: `${financials.roi_percent}%`, color: financials.roi_percent >= 0 ? "text-info" : "text-destructive" },
    { label: "Días Rentado", value: `${financials.days_rented}`, color: "text-foreground" },
    { label: "Utilización", value: `${financials.utilization_percent}%`, color: "text-info" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Resumen Financiero
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
