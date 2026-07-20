import { Link } from "react-router";
import { OpenLinkIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatMrrDate as fmt, type MrrItem } from "../hooks/useMrrColumns";

interface Props {
  items: MrrItem[];
  totalMrr: number;
}

export function MrrMobileList({ items, totalMrr }: Props) {
  return (
    <div className="p-3 space-y-3">
      <MobileCardList
        items={items}
        keyExtractor={(item) => item.forklift_id}
        emptyMessage="Sin montacargas rentados"
        renderCard={(item) => (
          <Card className="cursor-pointer">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Link
                  to={`/fleet/${item.forklift_id}`}
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
                >
                  {item.forklift_name}
                  <OpenLinkIcon className="h-3 w-3 shrink-0" />
                </Link>
                <span className="text-sm font-semibold font-mono whitespace-nowrap">
                  {formatCurrency(item.monthly_rate)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {[item.manufacturer, item.model].filter(Boolean).join(" ") || "—"}
              </p>
              <p className="text-xs">
                {item.customer_id ? (
                  <Link
                    to={`/customers/${item.customer_id}`}
                    className="text-primary hover:underline"
                  >
                    {item.customer_name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Sin cliente</span>
                )}
                {item.booking_number ? (
                  <span className="text-muted-foreground"> · {item.booking_number}</span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {fmt(item.start_date)} – {fmt(item.end_date)}
              </p>
            </CardContent>
          </Card>
        )}
      />
      {items.length > 0 && (
        <div className="flex items-center justify-between border-t pt-3 px-1">
          <span className="text-sm font-bold">Total MRR</span>
          <span className="text-sm font-bold font-mono">{formatCurrency(totalMrr)}</span>
        </div>
      )}
    </div>
  );
}
