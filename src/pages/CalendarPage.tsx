import { useBookings, useForklifts } from "@/hooks/useForkliftData";
import { PageTransition } from "@/components/PageTransition";
import type { BookingWithForklift } from "@/hooks/useBookings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, eachDayOfInterval, isWithinInterval, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, isToday, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle, Repeat, Plus } from "lucide-react";
import { BookingActions } from "@/components/BookingActions";
import { Link } from "react-router-dom";

const BOOKING_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(280, 65%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(340, 75%, 55%)",
  "hsl(190, 80%, 45%)",
  "hsl(60, 70%, 45%)",
];

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return BOOKING_COLORS[Math.abs(h) % BOOKING_COLORS.length];
}

export default function CalendarPage() {
  const { data: bookings, isLoading: bLoading } = useBookings();
  const { data: forklifts, isLoading: fLoading } = useForklifts();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState("all");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const forkliftMap = useMemo(() => new Map(forklifts?.map((f) => [f.id, f])), [forklifts]);

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

  // Color legend: map customer names to colors from visible bookings
  const customerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    bookings?.forEach((b) => {
      if (!b.customer_name || map.has(b.customer_name)) return;
      // Check if booking overlaps current month
      const bStart = parseISO(b.start_date);
      const bEnd = parseISO(b.end_date);
      if (bEnd >= monthStart && bStart <= monthEnd) {
        map.set(b.customer_name, hashColor(b.id));
      }
    });
    return map;
  }, [bookings, monthStart, monthEnd]);

  // Filtered bookings for the list
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    if (statusFilter === "all") return bookings;
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  if (bLoading || fLoading) {
    return <div className="p-6"><Skeleton className="h-96" /></div>;
  }

  return (
    <PageTransition>
    <TooltipProvider>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Calendario de Disponibilidad"
        subtitle="Ver reservas de toda la flota"
        action={
          <Button asChild>
            <Link to="/bookings/new"><Plus className="h-4 w-4" /> Nueva Reserva</Link>
          </Button>
        }
      />

      {endingSoon.length > 0 && (
        <Card className="border-status-maintenance/30 bg-status-maintenance/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-status-maintenance" />
              <span className="font-medium text-sm">Reservas por vencer ({endingSoon.length})</span>
            </div>
            <div className="space-y-1">
              {endingSoon.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/80">
                  <span>{forkliftMap.get(b.forklift_id)?.name} — {b.customer_name}</span>
                  <span className="text-xs text-muted-foreground">Termina: {format(parseISO(b.end_date), "d MMM yyyy", { locale: es })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy", { locale: es })}</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Hoy</Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day-of-week header row */}
            <div className="flex border-b pb-1 mb-0">
              <div className="w-36 shrink-0" />
              <div className="flex-1 flex">
                {days.map((day) => {
                  const wd = getDay(day);
                  const isWeekend = wd === 0 || wd === 6;
                  return (
                    <div
                      key={`wd-${day.toISOString()}`}
                      className={`flex-1 text-center text-[9px] font-medium ${isWeekend ? "text-destructive/60" : "text-muted-foreground/60"}`}
                    >
                      {format(day, "EEE", { locale: es })}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Day number header row */}
            <div className="flex border-b pb-2 mb-2">
              <div className="w-36 shrink-0 text-xs font-medium text-muted-foreground">Montacargas</div>
              <div className="flex-1 flex">
                {days.map((day) => {
                  const wd = getDay(day);
                  const isWeekend = wd === 0 || wd === 6;
                  const today = isToday(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`flex-1 text-center text-[10px] ${today ? "font-bold text-primary" : isWeekend ? "text-destructive/60" : "text-muted-foreground"}`}
                    >
                      {today ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                          {format(day, "d")}
                        </span>
                      ) : (
                        format(day, "d")
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Forklift rows */}
            {forklifts?.map((fl) => (
              <div key={fl.id} className="flex items-center border-b py-1.5 hover:bg-muted/30">
                <div className="w-36 shrink-0 flex items-center gap-2 pr-2">
                  <span className="text-xs font-mono font-medium truncate">{fl.name}</span>
                  <StatusBadge status={fl.status} />
                </div>
                <div className="flex-1 flex">
                  {days.map((day) => {
                    const wd = getDay(day);
                    const isWeekend = wd === 0 || wd === 6;
                    const today = isToday(day);
                    const booking = bookingsByForklift.get(fl.id)?.find(
                      (b) =>
                        (b.status === "confirmed" || b.status === "completed" || b.status === "cancelled") &&
                        isWithinInterval(day, {
                          start: parseISO(b.start_date),
                          end: parseISO(b.end_date),
                        })
                    );
                    const isConfirmed = booking?.status === "confirmed";
                    const bgColor = booking ? hashColor(booking.id) : undefined;
                    const duration = booking ? differenceInDays(parseISO(booking.end_date), parseISO(booking.start_date)) + 1 : 0;

                    return (
                      <div
                        key={day.toISOString()}
                        className={`flex-1 flex justify-center ${isWeekend ? "bg-muted/20" : ""} ${today ? "bg-primary/5" : ""}`}
                      >
                        {booking ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={`w-full h-5 rounded-sm mx-px ${!isConfirmed ? "opacity-30 border border-dashed border-foreground/30" : ""}`}
                                style={{ background: bgColor }}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs space-y-1">
                              <p className="font-semibold">{booking.customer_name}</p>
                              <p>{format(parseISO(booking.start_date), "d MMM", { locale: es })} → {format(parseISO(booking.end_date), "d MMM yyyy", { locale: es })}</p>
                              <p className="text-muted-foreground">{duration} día{duration !== 1 ? "s" : ""} · {{ confirmed: "Confirmada", completed: "Completada", cancelled: "Cancelada", pending: "Pendiente" }[booking.status] || booking.status}</p>
                            </TooltipContent>
                          </Tooltip>
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

          {/* Color legend */}
          {customerColorMap.size > 0 && (
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
              {Array.from(customerColorMap.entries()).map(([name, color]) => (
                <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Reservas</CardTitle>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-2.5 h-6">Todas</TabsTrigger>
              <TabsTrigger value="confirmed" className="text-xs px-2.5 h-6">Confirmadas</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-2.5 h-6">Completadas</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs px-2.5 h-6">Canceladas</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {filteredBookings.length > 0 ? (
            <div className="space-y-2">
              {filteredBookings.map((b) => {
                const duration = differenceInDays(parseISO(b.end_date), parseISO(b.start_date)) + 1;
                return (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="font-medium text-sm">{forkliftMap.get(b.forklift_id)?.name} — {forkliftMap.get(b.forklift_id)?.model}</p>
                      <p className="text-xs text-muted-foreground">{b.customer_name} ({b.customer_contact})</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.recurring_billing && <Repeat className="h-3.5 w-3.5 text-primary" />}
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {format(parseISO(b.start_date), "d MMM yyyy", { locale: es })} → {format(parseISO(b.end_date), "d MMM yyyy", { locale: es })}
                        </p>
                        <p className="text-xs text-muted-foreground">{duration} día{duration !== 1 ? "s" : ""}</p>
                        <StatusBadge status={b.status} />
                      </div>
                      <BookingActions booking={b} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-6">No se encontraron reservas</p>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
    </PageTransition>
  );
}
