import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatCurrency";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
}

export function ReconciliationKpiCards({ lines }: Props) {
  const total = lines.length;
  const matched = lines.filter((l) => l.status === "matched").length;
  const charges = lines.filter((l) => l.signed_amount < 0).reduce((s, l) => s + Math.abs(l.signed_amount), 0);
  const credits = lines.filter((l) => l.signed_amount > 0).reduce((s, l) => s + l.signed_amount, 0);
  const pct = total === 0 ? 0 : Math.round((matched / total) * 100);

  const cards = [
    { label: "Cargos del periodo", value: formatCurrency(charges) },
    { label: "Abonos del periodo", value: formatCurrency(credits) },
    { label: "Neto del periodo", value: formatCurrency(credits - charges) },
    { label: "% conciliado", value: `${pct}% (${matched}/${total})` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="py-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-lg font-semibold tabular-nums">{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
