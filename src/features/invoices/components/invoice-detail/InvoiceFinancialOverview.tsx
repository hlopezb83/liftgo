import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface Props {
  total: number;
  totalPaid: number;
  balance: number;
  creditedAmount: number;
  currency: string;
}

/**
 * V07/V10: resumen presentacional de Total/Pagado/Saldo. Sólo muestra valores
 * ya derivados por la página; no calcula nada.
 */
export function InvoiceFinancialOverview({ total, totalPaid, balance, creditedAmount, currency }: Props) {
  const code = currency.trim().toUpperCase();
  const items = [
    { label: "Total", value: total },
    { label: "Pagado", value: totalPaid },
    { label: "Saldo", value: balance, strong: true },
  ];
  return (
    <Card aria-label="Resumen de importes">
      <CardContent className="p-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {items.map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{it.label}</dt>
              <dd
                data-testid={`overview-${it.label.toLowerCase()}`}
                className={`tabular-nums [overflow-wrap:anywhere] ${it.strong ? "text-2xl font-bold" : "text-xl font-semibold"}`}
              >
                {formatCurrencyWithCode(it.value, code)} <span className="text-sm font-medium text-muted-foreground">{code}</span>
              </dd>
            </div>
          ))}
        </dl>
        {creditedAmount > 0 && (
          <p className="mt-3 text-sm text-muted-foreground tabular-nums" data-testid="overview-credited">
            Notas de crédito aplicadas: {formatCurrencyWithCode(creditedAmount, code)} {code}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
