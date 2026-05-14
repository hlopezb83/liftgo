import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, CalendarClock, AlertTriangle, ArrowRight } from "lucide-react";
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
      href: "/mrr",
    },
    {
      label: "Utilización de Flota",
      value: `${utilizationPercent}%`,
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      href: "/reports?type=utilization",
    },
    {
      label: "DSO (Días de Cobro)",
      value: `${dso} días`,
      icon: CalendarClock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      href: "/reports?type=aging",
    },
    {
      label: "Cartera Vencida",
      value: formatCurrency(overdueTotal),
      icon: AlertTriangle,
      color: overdueTotal > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: overdueTotal > 0 ? "bg-destructive/10" : "bg-muted",
      href: "/invoices?status=overdue",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Link key={kpi.label} to={kpi.href} className="group">
          <Card className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group-hover:ring-2 group-hover:ring-primary/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${kpi.bgColor}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground leading-tight" title={kpi.label}>{kpi.label}</p>
                <p className="text-base font-bold truncate" title={kpi.value}>{kpi.value}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
