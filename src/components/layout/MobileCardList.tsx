import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyMessage: string;
  keyExtractor: (item: T) => string;
}

export function MobileCardList<T>({ items, renderCard, emptyMessage, keyExtractor }: MobileCardListProps<T>) {
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
    <div className="space-y-3 pb-24">

      {items.map((item) => (
        <div key={keyExtractor(item)}>{renderCard(item)}</div>
      ))}
    </div>
  );
}
