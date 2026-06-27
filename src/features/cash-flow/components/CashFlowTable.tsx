import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import type { CashFlowBucket, LightColor } from "../lib/cashFlowUtils";

interface Props {
  buckets: CashFlowBucket[];
  onSelect: (bucket: CashFlowBucket) => void;
}

function lightClass(light: LightColor): string {
  if (light === "red") return "bg-destructive";
  if (light === "amber") return "bg-warning/100";
  return "bg-success/100";
}

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
          <TableHead className="w-16 text-center">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {buckets.map((b) => (
          <TableRow
            key={b.index}
            className={cn("cursor-pointer odd:bg-muted/30 hover:bg-muted/60", b.items.length === 0 && "text-muted-foreground")}
            onClick={() => onSelect(b)}
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
              <span className={cn("inline-block h-3 w-3 rounded-full", lightClass(b.light))} aria-label={b.light} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
