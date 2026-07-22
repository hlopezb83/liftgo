import { StatusBadge } from "@/components/feedback/StatusBadge";
import { InfoRow } from "@/components/forms/InfoRow";
import { ClockIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMtyDate } from "@/lib/utils";
import { RecurringBillingBadge } from "../bookings/RecurringBillingBadge";
import type { BookingWithForklift } from "../../hooks/bookings/useBookings";

export function BookingBillingCard({ booking }: { booking: BookingWithForklift }) {
  const fmt = (d: string) => formatMtyDate(d);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-muted-foreground" /> Facturación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Facturación recurrente</span>
          <RecurringBillingBadge booking={booking} />
        </div>
        {booking.last_billed_date && (
          <InfoRow label="Última facturación" value={fmt(booking.last_billed_date)} />
        )}
        {booking.return_status && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estado de devolución</span>
            <StatusBadge status={booking.return_status} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
