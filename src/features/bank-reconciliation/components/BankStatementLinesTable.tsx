import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import { BANK_LINE_STATUS_LABELS } from "../lib/bankReconciliationConstants";
import type { BankStatementLine } from "../hooks/useBankStatementLines";

interface Props {
  lines: BankStatementLine[];
  onSelect: (line: BankStatementLine) => void;
}

const STATUS_TONE: Record<string, string> = {
  unmatched: "bg-muted text-muted-foreground",
  suggested: "bg-warning/10 text-warning",
  matched: "bg-success/10 text-success",
  ignored: "bg-muted text-muted-foreground",
};

export function BankStatementLinesTable({ lines, onSelect }: Props) {
  if (lines.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
        Sin movimientos para esta cuenta. Sube un estado de cuenta arriba para comenzar.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Descripción</th>
              <th className="text-left px-3 py-2">Referencia</th>
              <th className="text-right px-3 py-2">Importe</th>
              <th className="text-left px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr
                key={l.id}
                onClick={() => onSelect(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(l);
                  }
                }}
                tabIndex={0}
                role="button"
                className={cn(
                  "cursor-pointer hover:bg-muted/40 border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  i % 2 === 1 && "bg-muted/20",
                )}
              >
                <td className="px-3 py-2 whitespace-nowrap">{formatDateDisplay(l.posted_date)}</td>
                <td className="px-3 py-2 max-w-md truncate">{l.description || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.reference ?? "—"}</td>
                <td className={cn("px-3 py-2 text-right font-mono tabular-nums", l.signed_amount < 0 ? "text-destructive" : "text-success")}>
                  {formatCurrency(l.signed_amount)}
                </td>
                <td className="px-3 py-2">
                  <Badge className={cn("border-transparent", STATUS_TONE[l.status])}>{BANK_LINE_STATUS_LABELS[l.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
