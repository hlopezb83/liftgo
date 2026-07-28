import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { nowMty } from "@/lib/utils";
import { formatDateDisplay } from "@/lib/utils";

export interface UpcomingDueInvoice {
  id: string;
  invoice_number: string | null;
  due_date: string | null;
  balance?: number | string | null;
  total: number | string;
  moneda?: string | null;
}

const MS_PER_DAY = 86_400_000;

/** Días restantes (negativo = vencida) contra la fecha de Monterrey. */
function daysUntil(due: string): number {
  const today = nowMty();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = due.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
  return Math.round((target - start) / MS_PER_DAY);
}

function dueBadge(days: number) {
  if (days < 0) return { label: `Vencida ${Math.abs(days)} d`, variant: "destructive" as const };
  if (days <= 7) return { label: `Vence en ${days} d`, variant: "secondary" as const };
  return { label: `Vence en ${days} d`, variant: "outline" as const };
}

/**
 * Oleada 3 (C-2): "Próximos vencimientos" del portal de clientes.
 * Ordena las facturas pendientes por fecha de vencimiento más cercana.
 */
export function PortalUpcomingDues({ invoices }: { invoices: UpcomingDueInvoice[] }) {
  const rows = invoices
    .filter((i) => !!i.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Próximos vencimientos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((inv) => {
          const days = daysUntil(inv.due_date ?? "");
          const badge = dueBadge(days);
          const amount = Number(inv.balance ?? inv.total ?? 0);
          return (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{inv.invoice_number ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{formatDateDisplay(inv.due_date)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-semibold tabular-nums">
                  {formatCurrencyWithCode(amount, inv.moneda ?? "MXN")}
                </span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
