import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import { Clock, AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import type { AccountsPayableKpis } from "../hooks/useAccountsPayableKpis";

interface Props {
  kpis: AccountsPayableKpis;
}

const ITEMS = [
  { key: "totalPendiente", label: "Pendiente total", icon: Clock, tone: "text-foreground" },
  { key: "totalVencido", label: "Vencido", icon: AlertTriangle, tone: "text-destructive" },
  { key: "totalPorVencer", label: "Por vencer (7 días)", icon: CalendarClock, tone: "text-amber-600 dark:text-amber-400" },
  { key: "pagadoMesActual", label: "Pagado este mes", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
] as const;

export function AccountsPayableKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ITEMS.map(({ key, label, icon: Icon, tone }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-muted p-2.5">
              <Icon className={`h-4 w-4 ${tone}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className={`text-lg font-bold font-mono ${tone}`}>
                {formatCurrency(kpis[key])}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
