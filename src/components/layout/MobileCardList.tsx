import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  emptyMessage: string;
  keyExtractor: (item: T) => string;
}

function MobileCardListInner<T>({ items, renderCard, emptyMessage, keyExtractor }: MobileCardListProps<T>) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={keyExtractor(item)}>{renderCard(item)}</div>
      ))}
    </div>
  );
}

export const MobileCardList = memo(MobileCardListInner) as typeof MobileCardListInner;
