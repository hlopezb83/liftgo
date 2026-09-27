import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";
import { deliveryOverdueDays, deliveryOverdueLabel } from "../../lib/deliveryOverdue";
import { deliveryTypeLabel } from "../../lib/deliveryTypeLabel";
import { resolveDeliveryForkliftName } from "../../lib/resolveDeliveryForkliftName";

export type DeliveryCardItem = Pick<Tables<"deliveries">, "id" | "delivery_number" | "type" | "status" | "forklift_id" | "scheduled_date" | "scheduled_time" | "address" | "driver_name"> & { forklifts?: { name?: string | null } | null };


export function DeliveryMobileCard({ d, forkliftMap }: { d: DeliveryCardItem; forkliftMap: Map<string, { name?: string | null }> }) {
  const overdue = deliveryOverdueDays(d);
  const forkliftName = resolveDeliveryForkliftName(d, forkliftMap);
  return (
    <Link
      to={`/deliveries/${d.id}`}
      aria-label={`Ver ${deliveryTypeLabel(d.type).toLowerCase()} ${d.delivery_number}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Untranslated className="text-xs font-mono text-muted-foreground">{d.delivery_number}</Untranslated>
            <StatusBadge status={d.status} />
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{deliveryTypeLabel(d.type)}</span>
            {overdue > 0 && (
              <Badge variant="destructive" className="text-3xs px-1.5 py-0">{deliveryOverdueLabel(overdue)}</Badge>
            )}
          </div>
          <p className="text-sm font-medium">{forkliftName ? <Untranslated>{forkliftName}</Untranslated> : "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatDateMty(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</p>
          {d.address && <p className="text-xs text-muted-foreground truncate">{d.address}</p>}
          {d.driver_name && <p className="text-xs text-muted-foreground">Operador: {d.driver_name}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

