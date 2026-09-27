import { PlusCircle } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";
import type { BookingWithForklift } from "@/types/rental";

export function PendingReturnCard({ booking, daysOverdue, canWrite }: {
  booking: BookingWithForklift;
  daysOverdue: number;
  canWrite: boolean;
}) {
  return (
    <Card>
      <Link
        to={`/bookings/${booking.id}`}
        aria-label={`Ver reserva ${booking.booking_number}`}
        className="block rounded-lg p-4 space-y-1 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words text-xs font-mono text-muted-foreground">{booking.booking_number}</span>
          <Badge variant={daysOverdue > 7 ? "destructive" : "secondary"} className="shrink-0 font-mono text-[10px]">
            {daysOverdue} {daysOverdue === 1 ? "día" : "días"}
          </Badge>
        </div>
        <p className="break-words text-sm font-semibold">{booking.forklifts?.name ?? "—"}</p>
        <p className="break-words text-sm text-muted-foreground">{booking.customer_name}</p>
        <p className="text-xs font-mono text-muted-foreground">Fin: {formatDateMty(booking.end_date)}</p>
      </Link>
      {canWrite && <div className="px-4 pb-4">
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to={`/returns?booking_id=${booking.id}`}>
            <PlusCircle className="h-4 w-4 mr-1" /> Registrar devolución
          </Link>
        </Button>
      </div>}
    </Card>
  );
}
