import { useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, addMonths, subMonths, differenceInDays, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { useMemo, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { RefreshIcon, WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBookingsRange, bookingKeys } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useMaintenanceLogs } from "@/features/maintenance";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateMty, formatDayMonthMty } from "@/lib/format/dateFormats";
import { formatMonthLongEs } from "@/lib/format/formatMonthEs";
import { notifyAsync } from "@/lib/ui/appFeedback";
import { nowMty, formatMtyDate } from "@/lib/utils";
import { CalendarStatCards } from "../components/calendar/CalendarStatCards";
import { EquipmentListView } from "../components/calendar/EquipmentListView";
import { GanttCard, type MaintenanceWindow } from "../components/calendar/GanttCard";


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

/** Franjas de mantenimiento (próximo servicio y OT abiertas) por equipo. */
function useMaintenanceWindows(): MaintenanceWindow[] {
  const { data: maintenanceLogs } = useMaintenanceLogs();
  return useMemo(
    () =>
      (maintenanceLogs ?? []).flatMap((log) => {
        const windows: MaintenanceWindow[] = [];
        if (log.next_service_date) {
          windows.push({
            id: `${log.id}-next`,
            forklift_id: log.forklift_id,
            date: log.next_service_date,
            label: `Próximo servicio: ${log.service_type ?? "mantenimiento"}`,
          });
        }
        if (log.work_status !== "completed" && log.performed_at) {
          windows.push({
            id: `${log.id}-open`,
            forklift_id: log.forklift_id,
            date: log.performed_at.slice(0, 10),
            label: `OT abierta: ${log.service_type ?? "mantenimiento"}`,
          });
        }
        return windows;
      }),
    [maintenanceLogs],
  );
}



type ForkliftLike = { id: string; name: string };
type BookingLike = { id: string; forklift_id: string; customer_name: string | null; end_date: string };

function EndingSoonAlert({ items, forkliftMap }: { items: BookingLike[]; forkliftMap: Map<string, ForkliftLike> }) {
  if (items.length === 0) return null;
  return (
    <Card className="border-status-maintenance/30 bg-status-maintenance/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <WarnIcon className="h-4 w-4 text-status-maintenance" />
          <span className="font-medium text-sm">Reservas por vencer ({items.length})</span>
        </div>
        <div className="space-y-1">
          {items.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/80">
              <span>{forkliftMap.get(b.forklift_id)?.name} — {b.customer_name ?? "Sin cliente"}</span>
              <span className="text-xs text-muted-foreground">Termina: {formatMtyDate(b.end_date)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CalendarToolbarProps {
  viewMode: "gantt" | "list";
  setViewMode: (v: "gantt" | "list") => void;
  ganttRange: "month" | "week";
  setGanttRange: (v: "month" | "week") => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function CalendarToolbar({ viewMode, setViewMode, ganttRange, setGanttRange, isRefreshing, onRefresh }: CalendarToolbarProps) {
  return (
    <div className="flex items-center flex-wrap gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "gantt" | "list")}>
        <TabsList className="h-8 touch:h-11">
          {/* R6-FE-09: h-6 = 24px; en táctil sube a 44px. */}
          <TabsTrigger value="gantt" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Gantt</TabsTrigger>
          <TabsTrigger value="list" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Lista</TabsTrigger>
        </TabsList>
      </Tabs>
      {viewMode === "gantt" && (
        <Tabs value={ganttRange} onValueChange={(v) => setGanttRange(v as "month" | "week")}>
          <TabsList className="h-8 touch:h-11">
            <TabsTrigger value="week" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Semana</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Mes</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8 ml-auto touch:h-11"
        disabled={isRefreshing}
        onClick={onRefresh}
        aria-label="Actualizar calendario"
      >
        <RefreshIcon className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} /> Actualizar
      </Button>
    </div>
  );
}

/**
 * Skeleton que anticipa el layout real: KPIs de flota (4 tiles), la toolbar de
 * vistas/rango y la tarjeta del Gantt/lista, para evitar el salto de contenido
 * al hidratar. Misma convención que TableSkeleton: role="status" + sr-only.
 */
function CalendarLoadingSkeleton() {
  return (
    <PageContainer>
      <PageHeader title="Calendario de Disponibilidad" />
      <div className="space-y-6" role="status">
        <span className="sr-only">Cargando calendario…</span>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-24 ml-auto" />
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </PageContainer>
  );
}
