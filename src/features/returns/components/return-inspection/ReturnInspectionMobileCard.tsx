import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { Link } from "@/lib/router-compat-ui";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function ReturnInspectionMobileCard({ inspection: ins }: { inspection: ReturnInspectionWithJoins }) {
  return (
    <Link
      to={`/returns/${ins.id}`}
      aria-label={`Ver devolución ${ins.inspection_number}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-muted-foreground">{ins.inspection_number}</span>
            <StatusBadge status={ins.condition} />
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{ins.forklifts?.name || "—"}</span>
          </div>
          <p className="text-sm text-muted-foreground">{ins.bookings?.customer_name || "—"}</p>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span className="font-mono">{formatDateMty(ins.inspected_at)}</span>
            {ins.damage_cost ? (
              <span className="font-mono font-medium text-foreground">{formatCurrency(ins.damage_cost)}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
