import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, CalendarClock, AlertTriangle, ArrowRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";

interface FinancialKpiCardsProps {
  mrr: number;
  mrrPrev?: number;
  utilizationPercent: number;
  dso: number;
  dsoPrev?: number;
  overdueTotal: number;
  overdueTotalPrev?: number;
}

interface Trend {
  pct: number | null;
  direction: "up" | "down" | "flat";
  good: boolean;
}

/** Calcula tendencia. lowerIsBetter=true cuando bajar es bueno (DSO, cartera vencida) */
function calcTrend(current: number, previous: number | undefined, lowerIsBetter: boolean): Trend {
  if (previous === undefined || previous === null) return { pct: null, direction: "flat", good: true };
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: "flat", good: true };
    return { pct: null, direction: current > 0 ? "up" : "down", good: lowerIsBetter ? current <= 0 : current > 0 };
  }
  const delta = current - previous;
  const pct = (delta / Math.abs(previous)) * 100;
  const direction: "up" | "down" | "flat" = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  const good = direction === "flat" ? true : lowerIsBetter ? direction === "down" : direction === "up";
  return { pct: Math.round(pct), direction, good };
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.pct === null && trend.direction === "flat") return null;
  const Icon = trend.direction === "up" ? ArrowUp : trend.direction === "down" ? ArrowDown : Minus;
  const colorClass = trend.direction === "flat"
    ? "text-muted-foreground"
    : trend.good
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", colorClass)} title="vs mes anterior">
      <Icon className="h-2.5 w-2.5" />
      {trend.pct !== null ? `${Math.abs(trend.pct)}%` : ""}
    </span>
  );
}

export function FinancialKpiCards({
  mrr,
  mrrPrev,
  utilizationPercent,
  dso,
  dsoPrev,
  overdueTotal,
  overdueTotalPrev,
}: FinancialKpiCardsProps) {
  const kpis = [
    {
      label: "Ingreso Mensual Recurrente",
      value: formatCurrency(mrr),
      trend: calcTrend(mrr, mrrPrev, false),
      icon: DollarSign,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      href: "/mrr",
    },
    {
      label: "Utilización de Flota",
      value: `${utilizationPercent}%`,
      trend: { pct: null, direction: "flat" as const, good: true },
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      href: "/reports?type=utilization",
    },
    {
      label: "DSO (Días de Cobro)",
      value: `${dso} días`,
      trend: calcTrend(dso, dsoPrev, true),
      icon: CalendarClock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      href: "/reports?type=aging",
    },
    {
      label: "Cartera Vencida",
      value: formatCurrency(overdueTotal),
      trend: calcTrend(overdueTotal, overdueTotalPrev, true),
      icon: AlertTriangle,
      color: overdueTotal > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: overdueTotal > 0 ? "bg-destructive/10" : "bg-muted",
      href: "/invoices?status=overdue",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Link key={kpi.label} to={kpi.href} className="group">
          <Card className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group-hover:ring-2 group-hover:ring-primary/20">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-2.5 rounded-xl shrink-0 ${kpi.bgColor}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold truncate">{kpi.value}</p>
                  <TrendBadge trend={kpi.trend} />
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
