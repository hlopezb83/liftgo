import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { CashFlowBucket } from "../lib/cashFlowUtils";

interface Props {
  buckets: CashFlowBucket[];
  initialBalance: number;
}

export function CashFlowSummaryCards({ buckets, initialBalance }: Props) {
  const totalIn = buckets.reduce((s, b) => s + b.inflow, 0);
  const totalOut = buckets.reduce((s, b) => s + b.outflow, 0);
  const net = totalIn - totalOut;
  const finalAcc = initialBalance + net;

  const cards = [
    { label: "Saldo inicial", value: initialBalance, tone: "default" as const },
    { label: "Por cobrar", value: totalIn, tone: "good" as const },
    { label: "Por pagar", value: totalOut, tone: "bad" as const },
    { label: "Neto", value: net, tone: net >= 0 ? ("good" as const) : ("bad" as const) },
    { label: "Acumulado final", value: finalAcc, tone: finalAcc >= 0 ? ("good" as const) : ("bad" as const) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-3">
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p
              className={`text-lg font-bold font-mono mt-1 ${
                c.tone === "bad" ? "text-destructive" : c.tone === "good" ? "text-success" : ""
              }`}
            >
              {formatCurrency(c.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
