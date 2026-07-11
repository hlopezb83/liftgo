import { memo } from "react";
import { type LucideIcon } from "@/components/icons";
import { KpiTile } from "@/components/domain/KpiTile";

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

export const StatCards = memo(function StatCards({ cards }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <KpiTile
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          iconColor={card.color}
          iconBg={card.bgColor}
        />
      ))}
    </div>
  );
});
