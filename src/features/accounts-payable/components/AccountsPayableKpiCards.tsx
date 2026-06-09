import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Clock, AlertTriangle, CalendarClock, CheckCircle2, ShieldAlert, FileWarning,
} from "lucide-react";
import type { AccountsPayableKpis } from "../hooks/useAccountsPayableKpis";

interface Props {
  kpis: AccountsPayableKpis;
}

type Tone = "text-foreground" | "text-destructive" | "text-amber-600 dark:text-amber-400" | "text-emerald-600 dark:text-emerald-400";

interface KpiItem {
  key: keyof AccountsPayableKpis;
  label: string;
  icon: typeof Clock;
  tone: Tone;
  asCount?: boolean;
}

const ITEMS: readonly KpiItem[] = [
  { key: "totalPendiente", label: "Pendiente total", icon: Clock, tone: "text-foreground" },
  { key: "totalVencido", label: "Vencido", icon: AlertTriangle, tone: "text-destructive" },
  { key: "totalPorVencer", label: "Por vencer (7 días)", icon: CalendarClock, tone: "text-amber-600 dark:text-amber-400" },
  { key: "totalPorAprobar", label: "Por aprobar", icon: ShieldAlert, tone: "text-amber-600 dark:text-amber-400" },
  { key: "repPendientes", label: "REP pendientes", icon: FileWarning, tone: "text-amber-600 dark:text-amber-400", asCount: true },
  { key: "pagadoMesActual", label: "Pagado este mes", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
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
                <p className="text-[10px] text-muted-foreground">
                  {kpis.countPorAprobar} factura{kpis.countPorAprobar === 1 ? "" : "s"}
                </p>
              )}
              {key === "repPendientes" && kpis.repPendientes > 0 && (
                <p className="text-[10px] text-muted-foreground">pago{kpis.repPendientes === 1 ? "" : "s"} PPD</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
