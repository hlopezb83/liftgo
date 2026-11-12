import { ClockIcon, WarnIcon, CalendarClock, SuccessIcon, ShieldAlert, FileWarning } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency, kpiSizeClass } from "@/lib/format/formatCurrency";
import type { AccountsPayableKpis } from "../hooks/useAccountsPayableKpis";

interface Props {
  kpis: AccountsPayableKpis | undefined;
}

type Tone = "text-foreground" | "text-destructive" | "text-warning" | "text-success";

interface KpiItem {
  key: keyof AccountsPayableKpis;
  label: string;
  icon: typeof ClockIcon;
  tone: Tone;
  asCount?: boolean;
}

const ITEMS: readonly KpiItem[] = [
  { key: "totalPendiente", label: "Pendiente total", icon: ClockIcon, tone: "text-foreground" },
  { key: "totalVencido", label: "Vencido", icon: WarnIcon, tone: "text-destructive" },
  { key: "totalPorVencer", label: "Por vencer 7d", icon: CalendarClock, tone: "text-warning" },
  { key: "totalPorAprobar", label: "Por aprobar", icon: ShieldAlert, tone: "text-warning" },
  { key: "repPendientes", label: "REP pendientes", icon: FileWarning, tone: "text-warning", asCount: true },
  { key: "pagadoMesActual", label: "Pagado este mes", icon: SuccessIcon, tone: "text-success" },
] as const;

function countLabel(key: keyof AccountsPayableKpis, kpis: AccountsPayableKpis | undefined) {
  if (!kpis) return null;
  if (key === "totalPorAprobar" && kpis.countPorAprobar > 0) {
    return `${kpis.countPorAprobar} factura${kpis.countPorAprobar === 1 ? "" : "s"}`;
  }
  if (key === "repPendientes" && kpis.repPendientes > 0) {
    return `pago${kpis.repPendientes === 1 ? "" : "s"} PPD`;
  }
  return null;
}

export function AccountsPayableKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {ITEMS.map(({ key, label, icon: Icon, tone, asCount }) => {
        const value = kpis?.[key];
        const display = value === undefined ? "—" : asCount ? String(value) : formatCompactCurrency(value);
        const detail = countLabel(key, kpis);
        return (
          <Card key={key}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="rounded-full bg-muted p-2.5">
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div className="min-w-0">
                <p className="min-h-8 text-xs leading-4 text-muted-foreground">{label}</p>
                {/* R24-D: montos ≥$1M en compacto ($123.46 M) con el exacto al hover. */}
                <p
                  className={`font-bold tabular-nums ${kpiSizeClass(display)} ${tone}`}
                  title={asCount || value === undefined ? undefined : formatCurrency(value)}
                >
                  {display}
                </p>

                {detail && <p className="text-3xs text-muted-foreground">{detail}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
