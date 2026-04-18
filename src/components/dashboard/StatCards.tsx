import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";

interface StatCard {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}

interface StatCardsProps {
  cards: StatCard[];
}

export const StatCards = memo(function StatCards({ cards }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
          <CardContent className="p-5 flex items-center gap-4 overflow-hidden">
            <div className={`p-2.5 rounded-xl shrink-0 bg-gradient-to-br from-muted to-muted/60 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground truncate">{card.label}</p>
              <p className={`${typeof card.value === 'string' ? 'text-lg' : 'text-2xl'} font-bold truncate`}>{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
