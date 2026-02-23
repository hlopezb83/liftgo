import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { PageTransition } from "@/components/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle, Repeat, Plus } from "lucide-react";
import { BookingActions } from "@/components/BookingActions";
import { Link } from "react-router-dom";
import { CalendarStatCards } from "@/components/calendar/CalendarStatCards";
import { GanttChart } from "@/components/calendar/GanttChart";
import { EquipmentListView } from "@/components/calendar/EquipmentListView";

export default function CalendarPage() {
  const { data: bookings, isLoading: bLoading } = useBookings();
  const { data: forklifts, isLoading: fLoading } = useForklifts();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"gantt" | "list">("gantt");
  const [ganttRange, setGanttRange] = useState<"month" | "week">("month");

  const forkliftMap = useMemo(() => new Map(forklifts?.map((f) => [f.id, f])), [forklifts]);

  // Compute range based on ganttRange
  const rangeStart = ganttRange === "month" ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 });
  const rangeEnd = ganttRange === "month" ? endOfMonth(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 });

  const navigateBack = () => {
    setCurrentDate(ganttRange === "month" ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  };
  const navigateForward = () => {
    setCurrentDate(ganttRange === "month" ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  };
  const navigateToday = () => setCurrentDate(new Date());

  const rangeLabel = ganttRange === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : `${format(rangeStart, "d MMM", { locale: es })} – ${format(rangeEnd, "d MMM yyyy", { locale: es })}`;

  const endingSoon = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      const endDate = parseISO(b.end_date);
      const daysLeft = differenceInDays(endDate, new Date());
      return b.status === "confirmed" && daysLeft >= 0 && daysLeft <= 3;
    });
  }, [bookings]);

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

      <CalendarStatCards forklifts={forklifts} bookings={bookings} />

      {/* View mode selector */}
      <div className="flex items-center gap-3">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "gantt" | "list")}>
          <TabsList className="h-8">
            <TabsTrigger value="gantt" className="text-xs px-3 h-6">Gantt</TabsTrigger>
            <TabsTrigger value="list" className="text-xs px-3 h-6">Lista</TabsTrigger>
          </TabsList>
        </Tabs>
        {viewMode === "gantt" && (
          <Tabs value={ganttRange} onValueChange={(v) => setGanttRange(v as "month" | "week")}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs px-3 h-6">Semana</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3 h-6">Mes</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {viewMode === "gantt" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base capitalize">{rangeLabel}</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={navigateBack}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={navigateToday}>Hoy</Button>
              <Button variant="ghost" size="icon" onClick={navigateForward}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <GanttChart forklifts={forklifts} bookings={bookings} rangeStart={rangeStart} rangeEnd={rangeEnd} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipos y reservas</CardTitle>
          </CardHeader>
          <CardContent>
            <EquipmentListView forklifts={forklifts} bookings={bookings} />
          </CardContent>
        </Card>
      )}

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
