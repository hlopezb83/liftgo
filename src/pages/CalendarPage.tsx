import { useBookings, useForklifts } from "@/hooks/useForkliftData";
import type { BookingWithForklift } from "@/hooks/useBookings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { format, eachDayOfInterval, isWithinInterval, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays } from "date-fns";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle, Repeat } from "lucide-react";
import { BookingActions } from "@/components/BookingActions";

const BOOKING_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(280, 65%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
];

export default function CalendarPage() {
  const { data: bookings, isLoading: bLoading } = useBookings();
  const { data: forklifts, isLoading: fLoading } = useForklifts();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const forkliftMap = useMemo(() => new Map(forklifts?.map((f) => [f.id, f])), [forklifts]);

  // Pre-index bookings by forklift_id for O(1) lookups
  const bookingsByForklift = useMemo(() => {
    const map = new Map<string, BookingWithForklift[]>();
    bookings?.forEach((b) => {
      const list = map.get(b.forklift_id);
      if (list) list.push(b);
      else map.set(b.forklift_id, [b]);
    });
    return map;
  }, [bookings]);

  const endingSoon = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      const endDate = parseISO(b.end_date);
      const daysLeft = differenceInDays(endDate, new Date());
      return b.status === "confirmed" && daysLeft >= 0 && daysLeft <= 3;
    });
  }, [bookings]);

  if (bLoading || fLoading) {
    return <div className="p-6"><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Availability Calendar" subtitle="View bookings across your fleet" />

      {endingSoon.length > 0 && (
        <Card className="border-status-maintenance/30 bg-status-maintenance/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-status-maintenance" />
              <span className="font-medium text-sm">Bookings ending soon ({endingSoon.length})</span>
            </div>
            <div className="space-y-1">
              {endingSoon.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/80">
                  <span>{forkliftMap.get(b.forklift_id)?.name} — {b.customer_name}</span>
                  <span className="text-xs text-muted-foreground">Ends: {b.end_date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy")}</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex border-b pb-2 mb-2">
              <div className="w-36 shrink-0 text-xs font-medium text-muted-foreground">Forklift</div>
              <div className="flex-1 flex">
                {days.map((day) => (
                  <div key={day.toISOString()} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {format(day, "d")}
                  </div>
                ))}
              </div>
            </div>

            {forklifts?.map((fl, flIdx) => (
              <div key={fl.id} className="flex items-center border-b py-1.5 hover:bg-muted/30">
                <div className="w-36 shrink-0 flex items-center gap-2 pr-2">
                  <span className="text-xs font-mono font-medium truncate">{fl.name}</span>
                  <StatusBadge status={fl.status} />
                </div>
                <div className="flex-1 flex">
                  {days.map((day) => {
                    const booking = bookingsByForklift.get(fl.id)?.find(
                      (b) =>
                        b.status === "confirmed" &&
                        isWithinInterval(day, {
                          start: parseISO(b.start_date),
                          end: parseISO(b.end_date),
                        })
                    );
                    return (
                      <div key={day.toISOString()} className="flex-1 flex justify-center">
                        {booking ? (
                          <div
                            className="w-full h-5 rounded-sm mx-px"
                            style={{ background: BOOKING_COLORS[flIdx % BOOKING_COLORS.length] }}
                            title={`${booking.customer_name}: ${booking.start_date} → ${booking.end_date}`}
                          />
                        ) : (
                          <div className="w-full h-5 bg-muted/30 rounded-sm mx-px" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div>
                    <p className="font-medium text-sm">{forkliftMap.get(b.forklift_id)?.name} — {forkliftMap.get(b.forklift_id)?.model}</p>
                    <p className="text-xs text-muted-foreground">{b.customer_name} ({b.customer_contact})</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.recurring_billing && <Repeat className="h-3.5 w-3.5 text-primary" />}
                    <div className="text-right">
                      <p className="text-sm font-medium">{b.start_date} → {b.end_date}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    <BookingActions booking={b} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-6">No bookings yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
