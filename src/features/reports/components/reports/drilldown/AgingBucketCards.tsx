import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";

interface Props {
  totals: Record<string, number>;
  selected: string | null;
  onSelect: (bucket: string | null) => void;
}

export function AgingBucketCards({ totals, selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(totals).map(([range, total]) => {
          const active = selected === range;
          return (
            <Card
              key={range}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              onClick={() => onSelect(active ? null : range)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(active ? null : range);
                }
              }}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary bg-primary/5",
              )}
            >
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-xs text-muted-foreground">{range} días</p>
                <p className="font-mono font-bold text-lg">{formatCurrency(total)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {selected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Mostrando bucket {selected} días</span>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => onSelect(null)}>
            <CloseIcon className="h-3 w-3 mr-1" /> Quitar filtro
          </Button>
        </div>
      )}
    </div>
  );
}
