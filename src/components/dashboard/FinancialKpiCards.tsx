import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, CalendarClock, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

interface FinancialKpiCardsProps {
  mrr: number;
  utilizationPercent: number;
  dso: number;
  overdueTotal: number;
}

export function FinancialKpiCards({ mrr, utilizationPercent, dso, overdueTotal }: FinancialKpiCardsProps) {
  const kpis = [
    {
      label: "Ingreso Mensual Recurrente",
      value: formatCurrency(mrr),
      icon: DollarSign,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    },
    {
      label: "Utilización de Flota",
      value: `${utilizationPercent}%`,
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      label: "DSO (Días de Cobro)",
      value: `${dso} días`,
      icon: CalendarClock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    },
    {
      label: "Cartera Vencida",
      value: formatCurrency(overdueTotal),
      icon: AlertTriangle,
      color: overdueTotal > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: overdueTotal > 0 ? "bg-destructive/10" : "bg-muted",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${kpi.bgColor}`}>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
              <p className="text-lg font-bold truncate">{kpi.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
