import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import type { CashFlowBucket, LightColor } from "../lib/cashFlowUtils";

const LIGHT_LABELS: Record<LightColor, string> = { red: "En riesgo", amber: "Precaución", green: "Saludable" };

interface Props {
  buckets: CashFlowBucket[];
  onSelect: (bucket: CashFlowBucket) => void;
}

const LIGHT_STATUSES: Record<LightColor, string> = { red: "overdue", amber: "pending", green: "available" };

export function CashFlowTable({ buckets, onSelect }: Props) {
  return (
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10">
        <TableRow>
          <TableHead className="w-20">Sem.</TableHead>
          <TableHead>Rango</TableHead>
          <TableHead className="text-right">Entradas</TableHead>
          <TableHead className="text-right">Salidas</TableHead>
          <TableHead className="text-right">Neto</TableHead>
          <TableHead className="text-right">Acumulado</TableHead>
          <TableHead className="w-32 text-center">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((b) => (
          <TableRow
            key={b.index}
            className={cn(
              "cursor-pointer odd:bg-muted/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              b.items.length === 0 && "text-muted-foreground",
            )}
            onClick={() => onSelect(b)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(b);
              }
            }}
            tabIndex={0}
            role="button"
          >
            <TableCell className="font-medium">{b.label}</TableCell>
            <TableCell className="text-xs">{b.rangeLabel}</TableCell>
            <TableCell className="text-right font-mono">{b.inflow > 0 ? formatCurrency(b.inflow) : "—"}</TableCell>
            <TableCell className="text-right font-mono">{b.outflow > 0 ? formatCurrency(b.outflow) : "—"}</TableCell>
            <TableCell className={cn("text-right font-mono", b.net < 0 && "text-destructive")}>
              {formatCurrency(b.net)}
            </TableCell>
            <TableCell className={cn("text-right font-mono font-bold", b.cumulative < 0 && "text-destructive")}>
              {formatCurrency(b.cumulative)}
            </TableCell>
            <TableCell className="text-center">
              <StatusBadge status={LIGHT_STATUSES[b.light]} label={LIGHT_LABELS[b.light]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
