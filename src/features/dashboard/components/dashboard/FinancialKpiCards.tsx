import { KpiTile } from "@/components/domain/KpiTile";
import { RevenueIcon, TrendingUpIcon, CalendarClock, OverdueIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ElementType, ReactNode } from "react";

interface FinancialKpiCardsProps {
  mrr: number;
  utilizationPercent: number;
  dso: number;
  overdueTotal: number;
  /** N-15: facturas vencidas en divisa sin tipo de cambio (excluidas del total). */
  overdueFxMissingCount?: number;
  /** A2-7: rentas en divisa sin tipo de cambio, excluidas del MRR vigente. */
  mrrFxMissingCount?: number;
  /** A2-7: idem para el MRR del mes previo (usado en comparativos). */
  mrrPrevFxMissingCount?: number;
}

export function FinancialKpiCards({
  mrr,
  utilizationPercent,
  dso,
  overdueTotal,
  overdueFxMissingCount = 0,
  mrrFxMissingCount = 0,
  mrrPrevFxMissingCount = 0,
}: FinancialKpiCardsProps) {
  const kpis: Array<{
    label: string;
    value: string;
    icon: ElementType;
    color: string;
    bgColor: string;
    href: string;
    hint?: ReactNode;
  }> = [
    {
      label: "Ingreso Mensual Recurrente",
      value: formatCurrency(mrr),
      icon: RevenueIcon,
      color: "text-success",
      bgColor: "bg-success/10",
      href: "/mrr",
      // A2-7: nunca se convierte 1:1; las rentas sin tipo de cambio se excluyen y se avisan.
      hint: mrrFxMissingCount > 0
        ? (
          <span className="text-xs text-warning">
            {mrrFxMissingCount} renta(s) en divisa sin tipo de cambio no se incluyen
          </span>
        )
        : undefined,
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
      // N-15: aviso cuando hay facturas en divisa sin tipo de cambio fuera del total.
      hint: overdueFxMissingCount > 0
        ? (
          <span className="text-xs text-warning">
            {overdueFxMissingCount} factura(s) en divisa sin tipo de cambio no se incluyen
          </span>
        )
        : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <KpiTile
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          iconColor={kpi.color}
          iconBg={kpi.bgColor}
          href={kpi.href}
          hint={kpi.hint}
        />
      ))}
    </div>
  );
}
