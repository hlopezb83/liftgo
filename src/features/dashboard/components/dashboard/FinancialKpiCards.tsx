import { RevenueIcon, TrendingUpIcon, CalendarClock, OverdueIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { KpiTile } from "@/components/domain/KpiTile";

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
      icon: RevenueIcon,
      color: "text-success",
      bgColor: "bg-success/10",
      href: "/mrr",
    },
    {
      label: "Utilización de Flota",
      value: `${utilizationPercent}%`,
      icon: TrendingUpIcon,
      color: "text-info",
      bgColor: "bg-info/10",
      href: "/reports?type=utilization",
    },
    {
      label: "DSO (Días de Cobro)",
      value: `${dso} días`,
      icon: CalendarClock,
      color: "text-warning",
      bgColor: "bg-warning/10",
      href: "/reports?type=aging",
    },
    {
      label: "Cartera Vencida",
      value: formatCurrency(overdueTotal),
      icon: OverdueIcon,
      color: overdueTotal > 0 ? "text-destructive" : "text-muted-foreground",
      bgColor: overdueTotal > 0 ? "bg-destructive/10" : "bg-muted",
      href: "/invoices?status=overdue",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <KpiTile
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          iconColor={kpi.color}
          iconBg={kpi.bgColor}
          href={kpi.href}
        />
      ))}
    </div>
  );
}
