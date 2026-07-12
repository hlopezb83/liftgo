import { Link } from "react-router";
import { DocumentIcon, CalendarIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { BookingWithForklift } from "@/features/bookings";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateRange } from "@/lib/utils";

interface Props {
  sourceQuote?: Pick<Tables<"quotes">, "id" | "quote_number"> | null;
  sourceBooking?: BookingWithForklift | null;
  sourceBookings?: BookingWithForklift[];
}

export function InvoiceSourceLinks({ sourceQuote, sourceBooking, sourceBookings }: Props) {
  const bookings: BookingWithForklift[] = sourceBookings && sourceBookings.length > 0
    ? sourceBookings
    : (sourceBooking ? [sourceBooking] : []);

  if (!sourceQuote && bookings.length === 0) return null;

  return (
    <>
      {sourceQuote && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2">
            <DocumentIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generada desde cotización:</span>
            <Link to={`/quotes/${sourceQuote.id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                {sourceQuote.quote_number}
              </Badge>
            </Link>
          </CardContent>
        </Card>
      )}

      {bookings.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {bookings.length === 1 ? "Generada desde reserva:" : `Generada desde ${bookings.length} reservas:`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 ml-6">
              {bookings.map((b) => (
                <Link key={b.id} to="/bookings">
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                    {b.forklifts?.name || "Reserva"} · {formatDateRange(b.start_date, b.end_date)}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
