import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { BankReconciliationKpis } from "../hooks/useBankStatementLines";

interface Props {
  kpis: BankReconciliationKpis;
  /** Moneda de la cuenta bancaria seleccionada (evita mostrar todo como MXN). */
  currency?: string;
}

export function ReconciliationKpiCards({ kpis, currency = "MXN" }: Props) {
  const conciliable = kpis.totalCount - kpis.ignoredCount;
  const pct = conciliable === 0 ? 0 : Math.round((kpis.matchedCount / conciliable) * 100);

  const cards = [
    { key: "charges", label: "Cargos del periodo", value: formatCurrencyWithCode(kpis.charges, currency) },
    { key: "credits", label: "Abonos del periodo", value: formatCurrencyWithCode(kpis.credits, currency) },
    { key: "net", label: "Neto del periodo", value: formatCurrencyWithCode(kpis.credits - kpis.charges, currency) },
    {
      key: "reconciled",
      label: "% conciliado",
      value: `${pct}% (${kpis.matchedCount}/${conciliable})`,
      hint: kpis.ignoredCount > 0
        ? `${kpis.pendingCount} pendientes · ${kpis.ignoredCount} ignorados`
        : `${kpis.pendingCount} pendientes`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="bank-kpis">
      {cards.map((c) => (
        <Card key={c.label} data-testid={`bank-kpi-${c.key}`}>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-lg font-semibold tabular-nums">{c.value}</div>
            {c.hint && <div className="text-[11px] text-muted-foreground">{c.hint}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
