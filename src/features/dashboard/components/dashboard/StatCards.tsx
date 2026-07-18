import { KpiTile } from "@/components/domain/KpiTile";
import { type LucideIcon } from "@/components/icons";

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

export function StatCards({ cards }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1">
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
}

