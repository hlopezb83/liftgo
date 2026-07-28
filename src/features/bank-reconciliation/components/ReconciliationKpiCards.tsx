import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
  /** Moneda de la cuenta bancaria seleccionada (evita mostrar todo como MXN). */
  currency?: string;
}

export function ReconciliationKpiCards({ lines, currency = "MXN" }: Props) {
  const total = lines.length;
  const matched = lines.filter((l) => l.status === "matched").length;
  const pending = lines.filter((l) => l.status === "unmatched" || l.status === "suggested").length;
  const charges = lines.filter((l) => l.signed_amount < 0).reduce((s, l) => s + Math.abs(l.signed_amount), 0);
  const credits = lines.filter((l) => l.signed_amount > 0).reduce((s, l) => s + l.signed_amount, 0);
  const pct = total === 0 ? 0 : Math.round((matched / total) * 100);

  const cards = [
    { key: "charges", label: "Cargos del periodo", value: formatCurrencyWithCode(charges, currency) },
    { key: "credits", label: "Abonos del periodo", value: formatCurrencyWithCode(credits, currency) },
    { key: "net", label: "Neto del periodo", value: formatCurrencyWithCode(credits - charges, currency) },
    {
      key: "reconciled",
      label: "% conciliado",
      value: `${pct}% (${matched}/${total})`,
      hint: `${pending} pendientes`,
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
