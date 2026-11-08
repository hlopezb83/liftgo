import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { partCategoryLabel } from "../../lib/partCategories";
import type { PartInventory } from "../../hooks/usePartsInventory";

export function InventoryMobileCard({ part: p, onOpen }: { part: PartInventory; onOpen: (id: string) => void }) {
    const isLow = p.stock_quantity <= p.min_stock_level;
    return (
      <Card onClick={() => onOpen(p.id)} role="button" tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen(p.id);
        }}
        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium break-words">{p.name}</p>
              <p className="text-xs font-mono text-muted-foreground break-words">{p.sku || "Sin SKU"}</p>
            </div>
            <Badge variant={isLow ? "destructive" : "secondary"}>{p.stock_quantity}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Badge variant="outline">{partCategoryLabel(p.category)}</Badge>
            <span className="font-mono">{formatCurrency(p.unit_cost)}</span>
          </div>
        </CardContent>
      </Card>
    );
  }
