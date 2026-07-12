import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { formatDateMty, formatDayMonthMty } from "@/lib/format/dateFormats";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useBookingsRange } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { nowMty, formatMtyDate } from "@/lib/utils";
import { CalendarStatCards } from "../components/calendar/CalendarStatCards";
import { EquipmentListView } from "../components/calendar/EquipmentListView";
import { GanttChart } from "../components/calendar/GanttChart";

function rangeFns(mode: "month" | "week") {
  return mode === "month"
    ? { start: startOfMonth, end: endOfMonth, prev: subMonths, next: addMonths, prevLabel: "Mes anterior", nextLabel: "Mes siguiente" }
    : { start: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), end: (d: Date) => endOfWeek(d, { weekStartsOn: 1 }), prev: subWeeks, next: addWeeks, prevLabel: "Semana anterior", nextLabel: "Semana siguiente" };
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(nowMty());
  const fetchFrom = subMonths(currentDate, 1);
  const fetchTo = addMonths(currentDate, 1);
  const { data: bookings, isLoading: bLoading } = useBookingsRange(fetchFrom, fetchTo);
  const { forkliftMap, forklifts, isLoading: fLoading } = useForkliftMap();

  const [viewMode, setViewMode] = useState<"gantt" | "list">("gantt");
  const [ganttRange, setGanttRange] = useState<"month" | "week">("month");

  const fns = rangeFns(ganttRange);
  const rangeStart = fns.start(currentDate);
  const rangeEnd = fns.end(currentDate);

  const navigateBack = () => setCurrentDate(fns.prev(currentDate, 1));
  const navigateForward = () => setCurrentDate(fns.next(currentDate, 1));
  const navigateToday = () => setCurrentDate(nowMty());

  const rangeLabel = ganttRange === "month"
    ? formatMonthLongEs(currentDate)
    : `${formatDayMonthMty(rangeStart)} – ${formatDateMty(rangeEnd)}`;

  const endingSoon = bookings
    ? bookings.filter((b) => {
        const endDate = parseISO(b.end_date);
        const daysLeft = differenceInDays(endDate, nowMty());
        return b.status === "confirmed" && daysLeft >= 0 && daysLeft <= 3;
      })
    : [];


  if (bLoading || fLoading) {
    return <PageContainer><Skeleton className="h-96" /></PageContainer>;
  }

  return (
    <PageTransition>
    <TooltipProvider>
    <PageContainer>
      <PageHeader
        title="Calendario de Disponibilidad"
        subtitle="Ver reservas de toda la flota"
      />

      {endingSoon.length > 0 && (
        <Card className="border-status-maintenance/30 bg-status-maintenance/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <WarnIcon className="h-4 w-4 text-status-maintenance" />
              <span className="font-medium text-sm">Reservas por vencer ({endingSoon.length})</span>
            </div>
            <div className="space-y-1">
              {endingSoon.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/80">
                  <span>{forkliftMap.get(b.forklift_id)?.name} — {b.customer_name}</span>
                  <span className="text-xs text-muted-foreground">Termina: {formatMtyDate(b.end_date)}</span>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={navigateBack}
                    aria-label={fns.prevLabel}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{fns.prevLabel}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={navigateToday} aria-label="Ir a hoy">
                    Hoy
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ir a la fecha actual</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={navigateForward}
                    aria-label={fns.nextLabel}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{fns.nextLabel}</TooltipContent>
              </Tooltip>
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

    </PageContainer>
    </TooltipProvider>
    </PageTransition>
  );
}
