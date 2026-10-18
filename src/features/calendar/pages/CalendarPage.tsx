import { addDays, startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerTodayMty } from "@/features/availability";
import { BOOKINGS_RANGE_LIMIT, useBookingsRange, type BookingWithForklift } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateMty, formatDayMonthMty } from "@/lib/format/dateFormats";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { nowMty } from "@/lib/utils";
import { CalendarRangeLoadingSkeleton, CalendarToolbar, EndingSoonAlert } from "../components/calendar/CalendarPageParts";
import { CalendarStatCards } from "../components/calendar/CalendarStatCards";
import { EquipmentListView } from "../components/calendar/EquipmentListView";
import { GanttCard } from "../components/calendar/GanttCard";
import { useCalendarLocationState } from "../hooks/useCalendarLocationState";
import { useMaintenanceWindows } from "../hooks/useMaintenanceWindows";
import { refreshCalendarQueries } from "../lib/refreshCalendarQueries";


function rangeFns(mode: "month" | "week") {
  return mode === "month"
    ? { start: startOfMonth, end: endOfMonth, prev: subMonths, next: addMonths, prevLabel: "Mes anterior", nextLabel: "Mes siguiente" }
    : { start: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }), end: (d: Date) => endOfWeek(d, { weekStartsOn: 1 }), prev: subWeeks, next: addWeeks, prevLabel: "Semana anterior", nextLabel: "Semana siguiente" };
}

function endingSoonBookings(bookings: BookingWithForklift[], todayTs: number) {
  return bookings.filter((booking) => {
    if (booking.status !== "confirmed") return false;
    const endTs = Date.parse(booking.end_date);
    if (!Number.isFinite(endTs)) return false;
    const daysLeft = differenceInDays(endTs, todayTs);
    return daysLeft >= 0 && daysLeft <= 3;
  });
}

export default function CalendarPage() {
  const isMobile = useIsMobile();
  const { currentDate, setCurrentDate, viewMode, setViewMode, ganttRange, setGanttRange } = useCalendarLocationState(isMobile);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fns = rangeFns(ganttRange);
  const rangeStart = fns.start(currentDate);
  const rangeEnd = fns.end(currentDate);
  const todayYmd = useServerTodayMty();
  const currentBookingsEnd = addDays(parseISO(todayYmd), 3);
  const {
    data: rangeBookingsRaw = [],
    isLoading: bLoading,
    isError: bError,
    isFetching: bFetching,
    refetch: bRefetch,
  } = useBookingsRange(rangeStart, rangeEnd);
  const {
    data: currentBookings = [],
    isLoading: currentBookingsLoading,
    isError: currentBookingsError,
    isFetching: currentBookingsFetching,
    refetch: currentBookingsRefetch,
  } = useBookingsRange(todayYmd, currentBookingsEnd);
  const {
    forkliftMap, forklifts, isLoading: fLoading,
    isError: fError, isFetching: fFetching, refetch: fRefetch,
  } = useForkliftMap();

  const bookingsTruncated = rangeBookingsRaw.length > BOOKINGS_RANGE_LIMIT;
  const bookings = bookingsTruncated
    ? rangeBookingsRaw.slice(0, BOOKINGS_RANGE_LIMIT)
    : rangeBookingsRaw;

  // A5-07: los mantenimientos programados (próximo servicio) y las órdenes de
  // trabajo abiertas se pintan como franjas sobre la fila del equipo, para que
  // al agendar una renta se vea que la unidad ya está comprometida.
  const {
    data: maintenanceWindows = [],
    isLoading: mLoading,
    isError: mError,
    isFetching: mFetching,
    refetch: mRefetch,
  } = useMaintenanceWindows(rangeStart, rangeEnd);

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
  const endingSoon = useMemo(() => endingSoonBookings(currentBookings, todayTs), [currentBookings, todayTs]);

  // Combina los estados de las consultas para mantener la orquestación legible.
  const hasQueryError = [bError, currentBookingsError, fError, mError].some(Boolean);
  const isLoading = [bLoading, currentBookingsLoading, fLoading, mLoading].some(Boolean);
  const summaryReady = ![currentBookingsLoading, fLoading, currentBookingsError, fError].some(Boolean);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCalendarQueries([bRefetch, currentBookingsRefetch, fRefetch, mRefetch]);
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
      {summaryReady && <EndingSoonAlert items={endingSoon} forkliftMap={forkliftMap} />}
      {bookingsTruncated && (
        <Alert>
          <WarnIcon className="h-4 w-4" />
          <AlertDescription>
            El periodo supera {BOOKINGS_RANGE_LIMIT} reservas. Se muestran solo las primeras {BOOKINGS_RANGE_LIMIT};
            cambia a Semana o elige otro periodo para revisar los resultados completos.
          </AlertDescription>
        </Alert>
      )}

      {summaryReady && <CalendarStatCards forklifts={forklifts} bookings={currentBookings} />}

      <CalendarToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        ganttRange={ganttRange}
        setGanttRange={setGanttRange}
        rangeLabel={rangeLabel}
        prevLabel={fns.prevLabel}
        nextLabel={fns.nextLabel}
        onPrev={navigateBack}
        onNext={navigateForward}
        onToday={navigateToday}
        isRefreshing={isRefreshing}
        onRefresh={() => { void handleRefresh(); }}
      />

      {hasQueryError && (
        <QueryErrorState
          entity="el calendario"
          onRetry={() => { void bRefetch(); void currentBookingsRefetch(); void fRefetch(); void mRefetch(); }}
          isRetrying={[bFetching, currentBookingsFetching, fFetching, mFetching].some(Boolean)}
        />
      )}

      {viewMode === "gantt" ? (
        <GanttCard
          isLoading={isLoading}
          hasQueryError={hasQueryError}
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
            <CardDescription>Reservas no canceladas en {rangeLabel.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? <CalendarRangeLoadingSkeleton /> : !hasQueryError && <EquipmentListView
              forklifts={forklifts}
              bookings={bookings}
              currentBookings={currentBookings}
            />}
          </CardContent>
        </Card>
      )}

    </PageContainer>
    </PageTransition>
  );
}
