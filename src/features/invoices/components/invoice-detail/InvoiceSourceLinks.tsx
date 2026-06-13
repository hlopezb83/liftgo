import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CalendarIcon } from "lucide-react";
import { formatDateRange } from "@/lib/utils";
import type { BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  sourceQuote?: Pick<Tables<"quotes">, "id" | "quote_number"> | null;
  sourceBooking?: BookingWithForklift | null;
}

export function InvoiceSourceLinks({ sourceQuote, sourceBooking }: Props) {
  if (!sourceQuote && !sourceBooking) return null;

  return (
    <>
      {sourceQuote && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generada desde cotización:</span>
            <Link to={`/quotes/${sourceQuote.id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                {sourceQuote.quote_number}
              </Badge>
            </Link>
          </CardContent>
        </Card>
      )}

      {sourceBooking && (
        <Card>
          <CardContent className="py-3 space-y-1">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Generada desde reserva:</span>
              <Link to="/bookings">
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  {sourceBooking.forklifts?.name || "Reserva"}
                </Badge>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              {sourceBooking.forklifts?.name} — {formatDateRange(sourceBooking.start_date, sourceBooking.end_date)}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
