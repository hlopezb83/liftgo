import { useBookings } from "@/hooks/useBookings";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { PageTransition } from "@/components/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { nowMty } from "@/lib/utils";
import { es } from "date-fns/locale";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { CalendarStatCards } from "@/components/calendar/CalendarStatCards";
import { GanttChart } from "@/components/calendar/GanttChart";
import { EquipmentListView } from "@/components/calendar/EquipmentListView";

export default function CalendarPage() {
  const { data: bookings, isLoading: bLoading } = useBookings();
  const { forkliftMap, forklifts, isLoading: fLoading } = useForkliftMap();
  const [currentDate, setCurrentDate] = useState(nowMty());
  
  const [viewMode, setViewMode] = useState<"gantt" | "list">("gantt");
  const [ganttRange, setGanttRange] = useState<"month" | "week">("month");

  

  // Compute range based on ganttRange
  const rangeStart = ganttRange === "month" ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 });
  const rangeEnd = ganttRange === "month" ? endOfMonth(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 });

  const navigateBack = () => {
    setCurrentDate(ganttRange === "month" ? subMonths(currentDate, 1) : subWeeks(currentDate, 1));
  };
  const navigateForward = () => {
    setCurrentDate(ganttRange === "month" ? addMonths(currentDate, 1) : addWeeks(currentDate, 1));
  };
  const navigateToday = () => setCurrentDate(nowMty());

  const rangeLabel = ganttRange === "month"
    ? format(currentDate, "MMMM yyyy", { locale: es })
    : `${format(rangeStart, "dd/MM")} – ${format(rangeEnd, "dd/MM/yyyy")}`;

  const endingSoon = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      const endDate = parseISO(b.end_date);
      const daysLeft = differenceInDays(endDate, nowMty());
      return b.status === "confirmed" && daysLeft >= 0 && daysLeft <= 3;
    });
  }, [bookings]);


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
                  <span className="text-xs text-muted-foreground">Termina: {format(parseISO(b.end_date), "dd/MM/yyyy")}</span>
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

    </div>
    </TooltipProvider>
    </PageTransition>
  );
}
