import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon, WarnIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMtyDate } from "@/lib/utils";

/**
 * Piezas visuales de CalendarPage: alerta de reservas por vencer, toolbar de
 * vistas/rango y skeleton de carga. La orquestación de datos y navegación
 * permanece en `pages/CalendarPage.tsx`.
 */

export type ForkliftLike = { id: string; name: string };
export type BookingLike = { id: string; forklift_id: string; customer_name: string | null; end_date: string };

export function EndingSoonAlert({ items, forkliftMap }: { items: BookingLike[]; forkliftMap: Map<string, ForkliftLike> }) {
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

export interface CalendarToolbarProps {
  viewMode: "gantt" | "list";
  setViewMode: (v: "gantt" | "list") => void;
  ganttRange: "month" | "week";
  setGanttRange: (v: "month" | "week") => void;
  rangeLabel: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function CalendarToolbar({
  viewMode,
  setViewMode,
  ganttRange,
  setGanttRange,
  rangeLabel,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  onToday,
  isRefreshing,
  onRefresh,
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center flex-wrap gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "gantt" | "list")}>
        <TabsList className="h-8 touch:h-11">
          {/* R6-FE-09: h-6 = 24px; en táctil sube a 44px. */}
          <TabsTrigger value="gantt" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Gantt</TabsTrigger>
          <TabsTrigger value="list" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Lista</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={ganttRange} onValueChange={(v) => setGanttRange(v as "month" | "week")}>
        <TabsList className="h-8 touch:h-11">
          <TabsTrigger value="week" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Semana</TabsTrigger>
          <TabsTrigger value="month" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Mes</TabsTrigger>
        </TabsList>
      </Tabs>
      {viewMode === "list" && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrev} aria-label={prevLabel}>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <span className="min-w-[128px] text-center text-xs font-medium">{rangeLabel}</span>
          <Button variant="ghost" size="sm" onClick={onToday}>Hoy</Button>
          <Button variant="ghost" size="icon" onClick={onNext} aria-label={nextLabel}>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
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

/** Loading affects only range content, so date and view controls retain focus. */
export function CalendarRangeLoadingSkeleton() {
  return (
    <div role="status" aria-label="Cargando calendario">
      <span className="sr-only">Cargando calendario.</span>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
