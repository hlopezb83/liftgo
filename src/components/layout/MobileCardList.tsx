import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyMessage: string;
  keyExtractor: (item: T) => string;
  className?: string;
}

export function MobileCardList<T>({ items, renderCard, emptyMessage, keyExtractor, className }: MobileCardListProps<T>) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  // R13-P2-09: espacio inferior para que el FAB no tape la última tarjeta.
  return (
    <div className={cn("space-y-3 pb-24", className)}>

      {items.map((item) => (
        <div key={keyExtractor(item)}>{renderCard(item)}</div>
      ))}
    </div>
  );
}
