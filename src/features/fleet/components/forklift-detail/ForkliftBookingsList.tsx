import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/utils";

import type { Tables } from "@/integrations/supabase/types";

interface ForkliftBookingsListProps {
  bookings: Tables<"bookings">[];
}

export function ForkliftBookingsList({ bookings }: ForkliftBookingsListProps) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Reservas</CardTitle></CardHeader>
      <CardContent>
        {bookings.length > 0 ? (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{b.customer_name || "Desconocido"}</span>
                  <span className="text-muted-foreground ml-2">
                    {format(parseDateLocal(b.start_date), "dd/MM")} – {format(parseDateLocal(b.end_date), "dd/MM/yyyy")}
                  </span>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin reservas aún</p>
        )}
      </CardContent>
    </Card>
  );
}
