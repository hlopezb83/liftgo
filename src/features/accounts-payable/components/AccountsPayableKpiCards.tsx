import { ClockIcon, WarnIcon, CalendarClock, SuccessIcon, ShieldAlert, FileWarning } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { AccountsPayableKpis } from "../hooks/useAccountsPayableKpis";

interface Props {
  kpis: AccountsPayableKpis;
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
  { key: "totalPorVencer", label: "Por vencer (7 días)", icon: CalendarClock, tone: "text-warning" },
  { key: "totalPorAprobar", label: "Por aprobar", icon: ShieldAlert, tone: "text-warning" },
  { key: "repPendientes", label: "REP pendientes", icon: FileWarning, tone: "text-warning", asCount: true },
  { key: "pagadoMesActual", label: "Pagado este mes", icon: SuccessIcon, tone: "text-success" },
] as const;

export function AccountsPayableKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {ITEMS.map(({ key, label, icon: Icon, tone, asCount }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-muted p-2.5">
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className={`text-lg font-bold font-mono ${tone}`}>
                {asCount ? kpis[key] : formatCurrency(kpis[key])}
              </p>
              {key === "totalPorAprobar" && kpis.countPorAprobar > 0 && (
                <p className="text-3xs text-muted-foreground">
                  {kpis.countPorAprobar} factura{kpis.countPorAprobar === 1 ? "" : "s"}
                </p>
              )}
              {key === "repPendientes" && kpis.repPendientes > 0 && (
                <p className="text-3xs text-muted-foreground">pago{kpis.repPendientes === 1 ? "" : "s"} PPD</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
