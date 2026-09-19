import { useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { useMemo, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookingsRange, bookingKeys } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateMty, formatDayMonthMty } from "@/lib/format/dateFormats";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { notifyAsync } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { CalendarLoadingSkeleton, CalendarToolbar, EndingSoonAlert } from "../components/calendar/CalendarPageParts";
import { CalendarStatCards } from "../components/calendar/CalendarStatCards";
import { EquipmentListView } from "../components/calendar/EquipmentListView";
import { GanttCard } from "../components/calendar/GanttCard";
import { useMaintenanceWindows } from "../hooks/useMaintenanceWindows";


function rangeFns(mode: "month" | "week") {
  return mode === "month"
    ? { start: startOfMonth, end: endOfMonth, prev: subMonths, next: addMonths, prevLabel: "Mes anterior", nextLabel: "Mes siguiente" }
    : { start: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), end: (d: Date) => endOfWeek(d, { weekStartsOn: 1 }), prev: subWeeks, next: addWeeks, prevLabel: "Semana anterior", nextLabel: "Semana siguiente" };
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(nowMty());
  const fetchFrom = subMonths(currentDate, 1);
  const fetchTo = addMonths(currentDate, 1);
  const { data: bookings, isLoading: bLoading, isError: bError, isFetching: bFetching, refetch: bRefetch } = useBookingsRange(fetchFrom, fetchTo);
  const {
    forkliftMap, forklifts, isLoading: fLoading,
    isError: fError, isFetching: fFetching, refetch: fRefetch,
  } = useForkliftMap();

  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<"gantt" | "list">(isMobile ? "list" : "gantt");
  const [ganttRange, setGanttRange] = useState<"month" | "week">("month");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fns = rangeFns(ganttRange);
  const rangeStart = fns.start(currentDate);
  const rangeEnd = fns.end(currentDate);

  // A5-07: los mantenimientos programados (próximo servicio) y las órdenes de
  // trabajo abiertas se pintan como franjas sobre la fila del equipo, para que
  // al agendar una renta se vea que la unidad ya está comprometida.
  const maintenanceWindows = useMaintenanceWindows();

  const navigateBack = () => setCurrentDate(fns.prev(currentDate, 1));
  const navigateForward = () => setCurrentDate(fns.next(currentDate, 1));
  const navigateToday = () => setCurrentDate(nowMty());



  const rangeLabel = ganttRange === "month"
    ? formatMonthLongEs(currentDate)
    : `${formatDayMonthMty(rangeStart)} – ${formatDateMty(rangeEnd)}`;

  // Tanda 3 P1-6: precomputamos endingSoon en useMemo. Antes se calculaba
  // `parseISO` en cada render sobre hasta ~2000 bookings; ahora sólo cuando
  // cambia el dataset o el día actual.
  const todayTs = nowMty().getTime();
  const endingSoon = useMemo(() => {
    if (!bookings) return [];
    return bookings.filter((b) => {
      if (b.status !== "confirmed") return false;
      const endTs = Date.parse(b.end_date);
      if (!Number.isFinite(endTs)) return false;
      const daysLeft = differenceInDays(endTs, todayTs);
      return daysLeft >= 0 && daysLeft <= 3;
    });
  }, [bookings, todayTs]);

  // R22-C: el calendario necesita reservas Y equipos; reintentar ambos.
  if (bError || fError) {
    return (
      <PageContainer>
        <PageHeader title="Calendario de Disponibilidad" />
        <QueryErrorState
          entity="el calendario"
          onRetry={() => { void bRefetch(); void fRefetch(); }}
          isRetrying={bFetching || fFetching}
        />
      </PageContainer>
    );
  }

  if (bLoading || fLoading) {
    return <CalendarLoadingSkeleton />;
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await notifyAsync(
        qc.refetchQueries({ queryKey: bookingKeys.all, type: "active" }),
        {
          loading: "Actualizando calendario…",
          success: "Calendario actualizado",
          error: "No se pudo actualizar el calendario",
        },
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <PageTransition>
    <PageContainer>
      <PageHeader
        title="Calendario de Disponibilidad"
        subtitle="Ver reservas de toda la flota"
      />
      <EndingSoonAlert items={endingSoon} forkliftMap={forkliftMap} />

      <CalendarStatCards forklifts={forklifts} bookings={bookings} />

      <CalendarToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        ganttRange={ganttRange}
        setGanttRange={setGanttRange}
        isRefreshing={isRefreshing}
        onRefresh={() => { void handleRefresh(); }}
      />

      {viewMode === "gantt" ? (
        <GanttCard
          rangeLabel={rangeLabel}
          prevLabel={fns.prevLabel}
          nextLabel={fns.nextLabel}
          onPrev={navigateBack}
          onNext={navigateForward}
          onToday={navigateToday}
          forklifts={forklifts}
          bookings={bookings}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          maintenanceWindows={maintenanceWindows}
        />
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
    </PageTransition>
  );
}
