import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";

interface StatCard {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Text color token, e.g. "text-primary" | "text-status-available" */
  color: string;
  /** Optional tinted background token. Defaults to bg derived from color. */
  bgColor?: string;
}

interface StatCardsProps {
  cards: StatCard[];
}

/** Map text-token → matching bg/10 token so KPI icon containers match FinancialKpiCards. */
const BG_BY_COLOR: Record<string, string> = {
  "text-primary": "bg-primary/10",
  "text-status-available": "bg-status-available/10",
  "text-status-rented": "bg-status-rented/10",
  "text-status-maintenance": "bg-status-maintenance/10",
  "text-status-sold": "bg-status-sold/10",
  "text-success": "bg-success/10",
  "text-info": "bg-info/10",
  "text-warning": "bg-warning/10",
  "text-destructive": "bg-destructive/10",
  "text-chart-5": "bg-chart-5/10",
};

export const StatCards = memo(function StatCards({ cards }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((card) => {
        const bg = card.bgColor ?? deriveBg(card.color);
        return (
          <Card key={card.label} className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 overflow-hidden">
              <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${bg}`}>
                <card.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${card.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight" title={card.label}>{card.label}</p>
                <p className={`${typeof card.value === 'string' ? 'text-sm sm:text-base' : 'text-lg sm:text-2xl'} font-bold truncate tabular-nums`} title={String(card.value)}>{card.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});

