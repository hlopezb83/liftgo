import { useNavigateTransition } from "@/hooks/useNavigateTransition";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay, cn } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle } from "@/components/icons";
import type { CashFlowBucket, CashFlowItem } from "../lib/cashFlowUtils";

interface Props {
  bucket: CashFlowBucket | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function Section({ title, items, kind, onClick }: { title: string; items: CashFlowItem[]; kind: "in" | "out"; onClick: (it: CashFlowItem) => void }) {
  const Icon = kind === "in" ? ArrowDownCircle : ArrowUpCircle;
  const total = items.reduce((s, i) => s + i.amountMxn, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={cn("text-sm font-semibold flex items-center gap-1", kind === "in" ? "text-success" : "text-destructive")}>
          <Icon className="h-4 w-4" />{title} ({items.length})
        </h3>
        <span className="font-mono text-sm font-bold">{formatCurrency(total)}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin movimientos</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <button
                type="button"
                onClick={() => onClick(it)}
                className="w-full flex items-center justify-between gap-3 text-left rounded-md border p-2 text-xs hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{it.number}</p>
                  <p className="text-muted-foreground truncate">{it.partyName} · vence {formatDateDisplay(it.dueDate)}</p>
                </div>
                <span className="font-mono font-bold shrink-0">{formatCurrency(it.amountMxn)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CashFlowWeekDetailSheet({ bucket, open, onOpenChange }: Props) {
  const navigate = useNavigateTransition();
  const inflows = bucket?.items.filter((i) => i.kind === "in") ?? [];
  const outflows = bucket?.items.filter((i) => i.kind === "out") ?? [];
  const go = (it: CashFlowItem) => {
    onOpenChange(false);
    navigate(it.navigatePath);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {bucket?.label} <span className="text-muted-foreground font-normal text-sm">— {bucket?.rangeLabel}</span>
          </SheetTitle>
        </SheetHeader>
        {bucket && (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10px] uppercase text-muted-foreground">Neto</p><p className={cn("font-mono font-bold", bucket.net < 0 && "text-destructive")}>{formatCurrency(bucket.net)}</p></div>
              <div><p className="text-[10px] uppercase text-muted-foreground">Acumulado</p><p className={cn("font-mono font-bold", bucket.cumulative < 0 && "text-destructive")}>{formatCurrency(bucket.cumulative)}</p></div>
              <div><p className="text-[10px] uppercase text-muted-foreground">Movimientos</p><p className="font-mono font-bold">{bucket.items.length}</p></div>
            </div>
            <Separator />
            <Section title="Por cobrar" items={inflows} kind="in" onClick={go} />
            <Separator />
            <Section title="Por pagar" items={outflows} kind="out" onClick={go} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
